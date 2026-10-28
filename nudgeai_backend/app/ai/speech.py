"""Speech to text with Meta's Muse Voice Transcribe, the only speech model we use.

The mobile mic records a short voice note, the app uploads it here, and the text goes into the
normal chat path. ``Transcriber`` is the seam: :class:`MetaTranscriber` talks to Meta,
:class:`FakeTranscriber` serves tests and local dev without a key.

Verification still owed (Gate 4): Meta's documented transport is a realtime WebSocket
(``wss://api.meta.ai/v1/asr/realtime``). The HTTP file route below follows the common
``/audio/transcriptions`` convention and has not been confirmed against Meta's docs, so the URL is
configurable (``MUSE_VOICE_URL``) and the response parser is deliberately tolerant. If Meta's
file route differs, only :meth:`MetaTranscriber.transcribe` changes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)


class SpeechError(Exception):
    """The transcription service failed or returned nothing usable."""


@dataclass(frozen=True, slots=True)
class Transcript:
    text: str
    model: str
    language: str | None = None


class Transcriber(Protocol):
    async def transcribe(self, audio: bytes, *, content_type: str) -> Transcript: ...


def transcribe_url() -> str:
    s = get_settings()
    return s.muse_voice_url or f"{s.meta_api_base_url.rstrip('/')}/audio/transcriptions"


def extract_text(payload: object) -> tuple[str, str | None]:
    """Pull (text, language) out of a response, tolerating a few plausible shapes."""
    if isinstance(payload, dict):
        text = payload.get("text") or payload.get("transcript") or ""
        if not text and isinstance(payload.get("data"), dict):
            return extract_text(payload["data"])
        lang = payload.get("language")
        return (str(text).strip(), str(lang) if lang else None)
    return ("", None)


class MetaTranscriber:
    def __init__(self, api_key: str, *, model: str, url: str, timeout: float) -> None:
        self._key, self._model, self._url, self._timeout = api_key, model, url, timeout

    async def transcribe(self, audio: bytes, *, content_type: str) -> Transcript:
        files = {"file": ("voice-note", audio, content_type or "application/octet-stream")}
        data = {"model": self._model} if self._model else {}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as http:
                resp = await http.post(
                    self._url,
                    headers={"Authorization": f"Bearer {self._key}"},
                    files=files,
                    data=data,
                )
                resp.raise_for_status()
                text, language = extract_text(resp.json())
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("muse voice transcribe failed: %s", exc)
            raise SpeechError("transcription is unavailable right now") from exc
        if not text:
            raise SpeechError("no speech was recognised")
        return Transcript(
            text=text, model=self._model or "muse-voice-transcribe", language=language
        )


class FakeTranscriber:
    """Deterministic stand-in: returns scripted text, or a canned sentence."""

    def __init__(self, text: str = "Push my 10am deep work to 11am please.") -> None:
        self.text = text
        self.calls: list[tuple[int, str]] = []

    async def transcribe(self, audio: bytes, *, content_type: str) -> Transcript:
        self.calls.append((len(audio), content_type))
        return Transcript(text=self.text, model="fake-transcriber", language="en")


_transcriber: Transcriber | None = None


def get_transcriber() -> Transcriber:
    global _transcriber
    if _transcriber is not None:
        return _transcriber
    s = get_settings()
    if s.force_fake_models or not s.meta_api_key:
        log.warning("speech: FAKE transcriber (no META_API_KEY or FORCE_FAKE_MODELS=true)")
        _transcriber = FakeTranscriber()
    else:
        _transcriber = MetaTranscriber(
            s.meta_api_key,
            model=s.muse_voice_model,
            url=transcribe_url(),
            timeout=s.speech_timeout_seconds,
        )
    return _transcriber


def set_transcriber(transcriber: Transcriber | None) -> None:
    """Override the transcriber (tests install a scripted one)."""
    global _transcriber
    _transcriber = transcriber
