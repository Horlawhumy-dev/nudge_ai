"""Voice input: audio in, text out. The text then goes through the normal chat path."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.ai import speech
from app.api.deps import CurrentUser
from app.api.limits import rate_limit
from app.core.config import get_settings

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

    try:
        result = await speech.get_transcriber().transcribe(bytes(buf), content_type=content_type)
    except speech.SpeechError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return TranscribeResponse(text=result.text, model=result.model, language=result.language)
