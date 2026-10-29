"""Live speech to text: the phone streams its microphone, Meta's realtime model streams words back.

Why it exists: transcribing a finished recording waits for the person to stop talking, uploads the
whole clip and then waits again (about 2 s measured). Streaming transcribes while they speak, and in
``ENDPOINTING`` mode Meta detects the end of the sentence itself, so the finished text arrives
about 0.4 s after they stop (measured), with no tap and no upload.

The app cannot hold the Meta key, so this module relays: one WebSocket to the phone, one to Meta.

Protocol with the phone (JSON text frames; audio is binary frames of 16 kHz mono 16-bit PCM):

    phone -> us   {"type": "start", "token": "<access token>", "mode": "ENDPOINTING"}  first frame
                  <binary PCM frames, about 80 ms each, in real time>
                  {"type": "stop"}                       the person ended it (tapped the mic)
    us -> phone   {"type": "ready"}                      you may send audio
                  {"type": "speech", "active": true}     speech started / stopped
                  {"type": "partial", "text": "..."}     the words so far (each replaces the last)
                  {"type": "turn", "text": "..."}        the finished sentence
                  {"type": "error", "code": "...", "message": "..."}

Meta's protocol (from its cookbook, ``06_muse_voice``): a JSON handshake carrying the key, raw PCM
frames paced in real time, ``{"type": "endStream"}`` to finish; events ``transcript`` (cumulative
partials and finals), ``speechStart``, ``speechEnd`` and ``speechComplete``.

Transcripts are never logged: they are what people say.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

import websockets

from app.core.config import get_settings
from app.core.security import TokenError, decode_token
from app.db.session import session_scope
from app.infra.redis import get_redis, k_rl
from app.services import auth_service

log = logging.getLogger(__name__)

MODES = ("ENDPOINTING", "PUSH_TO_TALK")
DEFAULT_MODEL = "muse-voice-transcribe-1.0"
ENCODING = "PCM_16KHZ"
BYTES_PER_SECOND = 16_000 * 2
# After the person ends the recording, how long to wait for Meta to finish its last words.
STOP_GRACE_SECONDS = 5.0


class LiveError(Exception):
    """A problem to tell the phone about. ``code`` is stable; ``message`` is for people."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# --------------------------------------------------------------------------- the two ends


class Channel(Protocol):
    """The phone's side of the relay."""

    async def receive(self) -> tuple[str, bytes | str]:
        """Next frame as ("bytes", data), ("text", data) or ("closed", "")."""
        ...

    async def send_json(self, data: dict[str, Any]) -> None: ...


class Upstream(Protocol):
    """Meta's side of the relay."""

    async def send_audio(self, pcm: bytes) -> None: ...
    async def end(self) -> None: ...
    def events(self) -> AsyncIterator[dict[str, Any]]: ...
    async def close(self) -> None: ...


class MetaUpstream:
    """The real thing: Meta's realtime WebSocket, after its JSON handshake."""

    def __init__(self, ws: Any) -> None:
        self._ws = ws

    @classmethod
    async def open(
        cls, *, url: str, token: str, model: str, mode: str, keywords: list[str] | None = None
    ) -> MetaUpstream:
        handshake: dict[str, Any] = {
            "mode": mode,
            # The credential rides inside the handshake, not an HTTP header (Meta's design).
            "authorization": {"accessToken": token},
            "audioEncoding": ENCODING,
            "model": model,
            "partialMode": "CUMULATIVE",  # each partial replaces the last
            "emitAudioProgress": False,
        }
        if keywords:
            handshake["keywords"] = keywords
        try:
            ws = await websockets.connect(url, max_size=None, open_timeout=10)
            await ws.send(json.dumps(handshake))
            ack = json.loads(await asyncio.wait_for(ws.recv(), 10))
        except (OSError, TimeoutError, websockets.WebSocketException, ValueError) as exc:
            log.warning("meta realtime: could not connect: %s", exc)
            raise LiveError("unavailable", "live transcription is unavailable right now") from exc
        if ack.get("type") == "error":
            await ws.close()
            log.warning("meta realtime: handshake rejected: %s", ack.get("message"))
            raise LiveError("unavailable", "live transcription is unavailable right now")
        return cls(ws)

    async def send_audio(self, pcm: bytes) -> None:
        await self._ws.send(pcm)

    async def end(self) -> None:
        await self._ws.send(json.dumps({"type": "endStream"}))

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        try:
            async for raw in self._ws:
                if isinstance(raw, bytes):
                    continue
                try:
                    yield json.loads(raw)
                except ValueError:
                    continue
        except websockets.exceptions.ConnectionClosed as exc:
            if getattr(exc, "code", None) not in (None, 1000):
                log.warning("meta realtime closed: %s %s", exc.code, (exc.reason or "")[:120])
                raise LiveError("unavailable", "live transcription stopped unexpectedly") from exc

    async def close(self) -> None:
        with contextlib.suppress(Exception):
            await self._ws.close()


# --------------------------------------------------------------------------------- the relay


@dataclass(slots=True)
class _Turn:
    """What we know about the sentence being spoken, so a turn can always be produced."""

    finals: list[str] = field(default_factory=list)
    last_partial: str = ""
    sent: bool = False

    def text(self) -> str:
        text = " ".join(self.finals).strip() or self.last_partial.strip()
        # Meta's push-to-talk finals sometimes end "please.." (seen live); a real ellipsis is kept.
        return re.sub(r"(?<!\.)\.\.(?!\.)", ".", text)

    def reset(self) -> None:
        self.finals.clear()
        self.last_partial = ""
        self.sent = False


async def run_session(
    channel: Channel,
    open_upstream: Any,
    *,
    mode: str,
    max_seconds: float,
) -> None:
    """Relay one live transcription session until the phone or Meta ends it.

    ``open_upstream`` is an async callable returning an :class:`Upstream`, called once the phone
    has asked to start. Raises :class:`LiveError` for problems the caller should report.
    """
    upstream: Upstream = await open_upstream()
    await channel.send_json({"type": "ready"})
    turn = _Turn()
    budget = int(max_seconds * BYTES_PER_SECOND * 1.25)  # headroom for network bunching
    received = 0
    stopped = False

    async def to_meta() -> None:
        nonlocal received, stopped
        while True:
            kind, data = await channel.receive()
            if kind == "bytes":
                received += len(data)
                if received > budget:
                    raise LiveError("limit", "that recording is longer than the live limit")
                await upstream.send_audio(data)  # type: ignore[arg-type]
            elif kind == "text":
                try:
                    message = json.loads(data)
                except ValueError:
                    continue
                if isinstance(message, dict) and message.get("type") == "stop":
                    stopped = True
                    await upstream.end()
                    return  # keep reading Meta's side until it finishes
            else:  # the phone went away
                return

    async def to_phone() -> None:
        async for event in upstream.events():
            kind = event.get("type")
            if kind == "transcript":
                text = str(event.get("transcript", "")).strip()
                if event.get("final"):
                    if text:
                        turn.finals.append(text)
                    # Push-to-talk has no speechComplete: the final transcript is the answer.
                    if mode == "PUSH_TO_TALK" and not turn.sent and turn.text():
                        await _send_turn(channel, turn)
                else:
                    turn.last_partial = text
                    await channel.send_json({"type": "partial", "text": text})
            elif kind == "speechComplete":
                text = str(event.get("transcript", "")).strip()
                if text:
                    turn.finals = [text]
                if not turn.sent and turn.text():
                    await _send_turn(channel, turn)
                turn.reset()
            elif kind in ("speechStart", "speechEnd"):
                await channel.send_json({"type": "speech", "active": kind == "speechStart"})
            elif kind == "error":
                log.warning("meta realtime error: %s", str(event.get("message"))[:200])
                raise LiveError("unavailable", "live transcription stopped unexpectedly")

    phone = asyncio.create_task(to_meta())
    meta = asyncio.create_task(to_phone())
    try:
        async with asyncio.timeout(max_seconds):
            # The phone side ends first when they stop or leave; then we wait for Meta to finish.
            done, _ = await asyncio.wait({phone, meta}, return_when=asyncio.FIRST_COMPLETED)
            left = False
            if phone in done:
                phone.result()
                if stopped:
                    # Meta flushes what it heard after endStream; don't wait on it forever.
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(asyncio.shield(meta), STOP_GRACE_SECONDS)
                else:
                    left = True  # the phone just went away: nobody to tell
            elif meta in done:
                meta.result()
        if not left and not turn.sent and turn.text():
            # Meta ended without announcing a finished sentence: use what it said.
            await _send_turn(channel, turn)
    except TimeoutError:
        raise LiveError("limit", "the live session reached its time limit") from None
    finally:
        for task in (phone, meta):
            task.cancel()
        await asyncio.gather(phone, meta, return_exceptions=True)
        await upstream.close()


async def _send_turn(channel: Channel, turn: _Turn) -> None:
    turn.sent = True
    await channel.send_json({"type": "turn", "text": turn.text()})


def meta_upstream_factory(mode: str, keywords: list[str] | None = None) -> Any:
    """An ``open_upstream`` for :func:`run_session` that talks to the real Meta endpoint."""
    s = get_settings()

    async def open_upstream() -> Upstream:
        if not s.meta_api_key or s.force_fake_models:
            raise LiveError("unavailable", "live transcription is not set up on the server")
        return await MetaUpstream.open(
            url=s.live_speech_url,
            token=s.meta_api_key,
            model=s.muse_voice_model or DEFAULT_MODEL,
            mode=mode,
            keywords=keywords,
        )

    return open_upstream


# ------------------------------------------------------------------- who may open a session


async def authenticate(token: object) -> UUID:
    """The user behind an access token, or a LiveError the phone can act on (sign in again)."""
    unauthorized = LiveError("unauthorized", "please sign in again")
    if not isinstance(token, str) or not token:
        raise unauthorized
    try:
        user_id = UUID(decode_token(token, "access")["sub"])
    except (TokenError, KeyError, ValueError) as exc:
        raise unauthorized from exc
    async with session_scope() as session:
        if await auth_service.get_user_by_id(session, user_id) is None:
            raise unauthorized
    return user_id


class Slot:
    """One live session per person at a time, and a cap on how often one can start.

    Live audio is the most expensive thing a phone can ask of us, and a stuck app that keeps
    reconnecting would otherwise open sessions with Meta without end. Redis is a cache, not a
    gate: if it is down, sessions are allowed (the session time limit still applies).
    """

    def __init__(self, user_id: UUID) -> None:
        self._user_id = user_id
        self._key = f"live:{user_id}"
        self._held = False

    async def __aenter__(self) -> Slot:
        s = get_settings()
        try:
            redis = get_redis()
            rate_key = k_rl(self._user_id, "live")
            count = await redis.incr(rate_key)
            if count == 1:
                await redis.expire(rate_key, 60)
            if count > s.rate_limit_live_per_minute:
                raise LiveError("busy", "too many tries, give it a moment")
            if not await redis.set(self._key, "1", nx=True, ex=int(s.live_speech_max_seconds) + 15):
                raise LiveError("busy", "voice is already open on another screen")
            self._held = True
        except LiveError:
            raise
        except Exception as exc:  # noqa: BLE001 - redis is a cache, not a gate
            log.warning("live slot check skipped: %s", exc)
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._held:
            with contextlib.suppress(Exception):
                await get_redis().delete(self._key)
