"""Text to speech with ElevenLabs, used only for spoken output.

Meta has no speech-output model (Muse Voice Transcribe goes the other way), so this is the one
non-Meta AI service. It sits behind :class:`Synthesizer`, like the transcriber, so the rest of the
app never knows which provider speaks, and tests use :class:`FakeSynthesizer` with no network.

ElevenLabs bills per character. Spoken text repeats a lot (tone previews, "Done!"), so the last
results are kept in memory, and one request is capped in length by the endpoint.
"""

from __future__ import annotations

import hashlib
import logging
from collections import OrderedDict
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

# 44.1 kHz mono MP3 at 64 kbit/s: clear speech at about 8 KB per second of audio.
OUTPUT_FORMAT = "mp3_44100_64"
CONTENT_TYPE = "audio/mpeg"


class SynthesisError(Exception):
    """The speech service failed or returned nothing usable."""


class NotConfigured(SynthesisError):
    """No ElevenLabs key is set, so spoken output is off."""


@dataclass(frozen=True, slots=True)
class Audio:
    data: bytes
    content_type: str = CONTENT_TYPE


class Synthesizer(Protocol):
    async def synthesize(self, text: str) -> Audio: ...


class ElevenLabsSynthesizer:
    def __init__(
        self, api_key: str, *, voice_id: str, model_id: str, base_url: str, timeout: float
    ) -> None:
        self._key, self._voice, self._model = api_key, voice_id, model_id
        self._base, self._timeout = base_url.rstrip("/"), timeout
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        """One connection kept open between requests. Opening a fresh one (DNS, TLS) for every
        spoken sentence measured at about 1.5 s extra on the first request of each burst."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def synthesize(self, text: str) -> Audio:
        url = f"{self._base}/v1/text-to-speech/{self._voice}"
        try:
            resp = await self._http().post(
                url,
                params={"output_format": OUTPUT_FORMAT},
                headers={"xi-api-key": self._key, "Accept": CONTENT_TYPE},
                json={"text": text, "model_id": self._model},
            )
        except httpx.HTTPError as exc:
            log.warning("elevenlabs request failed: %s", exc)
            raise SynthesisError("voice output is unavailable right now") from exc
        if resp.status_code != 200 or not resp.content:
            # ElevenLabs explains itself in the body (bad key, out of quota, unknown voice).
            # The spoken text is never logged: it can be the user's own words and replies.
            log.warning("elevenlabs: HTTP %s: %s", resp.status_code, resp.text[:300])
            raise SynthesisError("voice output is unavailable right now")
        return Audio(data=resp.content)


class FakeSynthesizer:
    """Deterministic stand-in for tests: returns recognisable bytes and records the calls."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def synthesize(self, text: str) -> Audio:
        self.calls.append(text)
        return Audio(data=b"ID3fake-mp3:" + text.encode())


class CachedSynthesizer:
    """Remembers the most recent results so repeated lines are not paid for twice."""

    def __init__(self, inner: Synthesizer, *, entries: int, scope: str) -> None:
        self._inner, self._max, self._scope = inner, max(0, entries), scope
        self._items: OrderedDict[str, Audio] = OrderedDict()

    def _key(self, text: str) -> str:
        return hashlib.sha256(f"{self._scope}\0{text}".encode()).hexdigest()

    async def aclose(self) -> None:
        close = getattr(self._inner, "aclose", None)
        if close is not None:
            await close()

    async def synthesize(self, text: str) -> Audio:
        key = self._key(text)
        hit = self._items.get(key)
        if hit is not None:
            self._items.move_to_end(key)
            return hit
        audio = await self._inner.synthesize(text)
        if self._max:
            self._items[key] = audio
            while len(self._items) > self._max:
                self._items.popitem(last=False)
        return audio


_synthesizer: Synthesizer | None = None


def get_synthesizer() -> Synthesizer:
    """The real service when a key is set, otherwise raises :class:`NotConfigured`."""
    global _synthesizer
    if _synthesizer is not None:
        return _synthesizer
    s = get_settings()
    if s.force_fake_models or not s.elevenlabs_api_key:
        raise NotConfigured("spoken replies are not set up on the server")
    _synthesizer = CachedSynthesizer(
        ElevenLabsSynthesizer(
            s.elevenlabs_api_key,
            voice_id=s.elevenlabs_voice_id,
            model_id=s.elevenlabs_model_id,
            base_url=s.elevenlabs_base_url,
            timeout=s.elevenlabs_timeout_seconds,
        ),
        entries=s.tts_cache_entries,
        scope=f"{s.elevenlabs_voice_id}:{s.elevenlabs_model_id}",
    )
    return _synthesizer


def set_synthesizer(synthesizer: Synthesizer | None) -> None:
    """Override the synthesizer (tests install a fake)."""
    global _synthesizer
    _synthesizer = synthesizer


async def aclose() -> None:
    """Close the long-lived connection (app shutdown)."""
    global _synthesizer
    close = getattr(_synthesizer, "aclose", None)
    if close is not None:
        await close()
