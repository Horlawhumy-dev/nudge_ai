"""Voice input: audio in, text out. The text then goes through the normal chat path."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket
from pydantic import BaseModel, Field

from app.ai import live_speech, speech, tts
from app.api.deps import CurrentUser
from app.api.limits import rate_limit
from app.core.config import get_settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/speech", tags=["speech"])

# Containers a phone's recorder produces, plus WAV. The model's own format limits are applied by
# Meta; this only rejects obvious non-audio before spending a call.
_AUDIO_PREFIXES = ("audio/", "video/mp4", "application/octet-stream")


class TranscribeResponse(BaseModel):
    text: str
    model: str
    language: str | None = None


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    dependencies=[
        Depends(
            rate_limit("speech", limit_setting="rate_limit_speech_per_minute", window_seconds=60)
        )
    ],
)
async def transcribe(request: Request, user: CurrentUser) -> TranscribeResponse:
    """Transcribe a short voice note. Send the raw audio bytes as the request body."""
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if not content_type.startswith(_AUDIO_PREFIXES):
        raise HTTPException(status_code=415, detail="send audio with an audio/* content type")

    limit = get_settings().speech_max_bytes
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > limit:
            raise HTTPException(
                status_code=413, detail=f"audio is larger than {limit // 1_000_000} MB"
            )
    if not buf:
        raise HTTPException(status_code=400, detail="no audio in the request body")
    # Meta's speech model only reads mono 16-bit WAV; anything else would come back as an opaque
    # 400, so say what is needed here instead.
    if not (buf[:4] == b"RIFF" and buf[8:12] == b"WAVE"):
        raise HTTPException(status_code=415, detail="send mono 16-bit WAV audio (16 or 24 kHz)")

    try:
        result = await speech.get_transcriber().transcribe(bytes(buf), content_type=content_type)
    except speech.SpeechError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return TranscribeResponse(text=result.text, model=result.model, language=result.language)


class SynthesizeRequest(BaseModel):
    # The cap is enforced per request below, from settings, so it follows configuration.
    text: str = Field(min_length=1)


@router.post(
    "/synthesize",
    response_class=Response,
    responses={200: {"content": {"audio/mpeg": {}}}},
    dependencies=[
        Depends(rate_limit("tts", limit_setting="rate_limit_tts_per_minute", window_seconds=60))
    ],
)
async def synthesize(body: SynthesizeRequest, user: CurrentUser) -> Response:
    """Speak a short piece of text. Returns MP3 audio; 503 when spoken output is not set up."""
    text = " ".join(body.text.split())
    if not text:
        raise HTTPException(status_code=422, detail="nothing to say")
    limit = get_settings().tts_max_chars
    if len(text) > limit:
        raise HTTPException(status_code=413, detail=f"text is longer than {limit} characters")
    try:
        audio = await tts.get_synthesizer().synthesize(text)
    except tts.NotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except tts.SynthesisError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(
        content=audio.data,
        media_type=audio.content_type,
        # The audio is generated for this exact text, so it is safe for the phone to keep a copy.
        headers={"Cache-Control": "private, max-age=86400"},
    )


# --------------------------------------------------------------------------- live (WebSocket)


class _PhoneChannel:
    """Adapts a Starlette WebSocket to the relay's small `Channel` interface."""

    def __init__(self, ws: WebSocket) -> None:
        self._ws = ws

    async def receive(self) -> tuple[str, bytes | str]:
        message = await self._ws.receive()
        if message["type"] == "websocket.disconnect":
            return ("closed", "")
        if message.get("bytes") is not None:
            return ("bytes", message["bytes"])
        return ("text", message.get("text") or "")

    async def send_json(self, data: dict[str, Any]) -> None:
        await self._ws.send_json(data)


async def _read_start(ws: WebSocket) -> dict[str, Any]:
    """The first frame must be a `start` message; nothing else is accepted before it."""
    timeout = get_settings().live_speech_start_timeout_seconds
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout)
    except (TimeoutError, ValueError, KeyError, RuntimeError) as exc:
        raise live_speech.LiveError("bad_request", "send a start message first") from exc
    if not isinstance(first, dict) or first.get("type") != "start":
        raise live_speech.LiveError("bad_request", "send a start message first")
    return first


@router.websocket("/live")
async def live(ws: WebSocket) -> None:
    """Live transcription. See `app.ai.live_speech` for the message protocol."""
    await ws.accept()
    s = get_settings()
    try:
        if not s.live_speech_enabled:
            raise live_speech.LiveError("unavailable", "live transcription is switched off")
        start = await _read_start(ws)
        user_id = await live_speech.authenticate(start.get("token"))
        requested = start.get("mode")
        mode = requested if requested in live_speech.MODES else "ENDPOINTING"
        keywords = [k for k in start.get("keywords") or [] if isinstance(k, str)][:20]
        async with live_speech.Slot(user_id):
            await live_speech.run_session(
                _PhoneChannel(ws),
                live_speech.meta_upstream_factory(mode, keywords),
                mode=mode,
                max_seconds=s.live_speech_max_seconds,
            )
    except live_speech.LiveError as exc:
        with contextlib.suppress(Exception):
            await ws.send_json({"type": "error", "code": exc.code, "message": exc.message})
    except Exception:  # noqa: BLE001 - the phone falls back to uploading the recording
        log.exception("live transcription failed")
        with contextlib.suppress(Exception):
            await ws.send_json(
                {"type": "error", "code": "unavailable", "message": "live transcription failed"}
            )
    finally:
        with contextlib.suppress(Exception):
            await ws.close()
