"""Voice input: the endpoint, and the Meta transcriber against a mocked HTTP service."""

from __future__ import annotations

import json

import httpx
import pytest
from httpx import AsyncClient

from app.ai import speech
from app.ai.speech import FakeTranscriber, MetaTranscriber, SpeechError, extract_text

API = "/api/v1"
Headers = dict[str, str]
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 32


@pytest.fixture(autouse=True)
def fake_transcriber():  # type: ignore[no-untyped-def]
    fake = FakeTranscriber("Push my 10am deep work to 11am please.")
    speech.set_transcriber(fake)
    yield fake
    speech.set_transcriber(None)


async def _post(client: AsyncClient, h: Headers, body: bytes = WAV, ctype: str = "audio/wav"):  # type: ignore[no-untyped-def]
    return await client.post(
        f"{API}/speech/transcribe", content=body, headers={**h, "Content-Type": ctype}
    )


async def test_transcribe_returns_text(
    client: AsyncClient, auth_headers: Headers, fake_transcriber: FakeTranscriber
) -> None:
    r = await _post(client, auth_headers)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "text": "Push my 10am deep work to 11am please.",
        "model": "fake-transcriber",
        "language": "en",
    }
    assert fake_transcriber.calls == [(len(WAV), "audio/wav")]


async def test_requires_auth_audio_type_and_body(
    client: AsyncClient, auth_headers: Headers
) -> None:
    anon = await client.post(
        f"{API}/speech/transcribe", content=WAV, headers={"Content-Type": "audio/wav"}
    )
    assert anon.status_code == 401
    assert (await _post(client, auth_headers, ctype="application/json")).status_code == 415
    assert (await _post(client, auth_headers, body=b"")).status_code == 400
    # m4a/aac from a phone recorder is not WAV, and Meta's model only reads WAV
    m4a = await _post(
        client, auth_headers, body=b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 40, ctype="audio/mp4"
    )
    assert m4a.status_code == 415 and "WAV" in m4a.json()["detail"]
    # the content type may carry parameters; the bytes decide
    assert (await _post(client, auth_headers, ctype="audio/wav; codecs=1")).status_code == 200


async def test_oversize_audio_is_refused(
    client: AsyncClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "speech_max_bytes", 100)
    r = await _post(client, auth_headers, body=b"\x00" * 300)
    assert r.status_code == 413


async def test_service_failure_is_a_502_not_a_crash(
    client: AsyncClient, auth_headers: Headers
) -> None:
    class Broken:
        async def transcribe(self, audio: bytes, *, content_type: str):  # type: ignore[no-untyped-def]
            raise SpeechError("transcription is unavailable right now")

    speech.set_transcriber(Broken())
    r = await _post(client, auth_headers)
    assert r.status_code == 502 and "unavailable" in r.json()["detail"]


async def test_transcribe_is_rate_limited(
    client: AsyncClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings
    from app.infra.redis import get_redis

    s = get_settings()
    monkeypatch.setattr(s, "rate_limits_enabled", True)
    monkeypatch.setattr(s, "rate_limit_speech_per_minute", 2)
    r = get_redis()
    stale = [k async for k in r.scan_iter(match="rl:*:speech")]
    if stale:
        await r.delete(*stale)
    codes = [(await _post(client, auth_headers)).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    stale = [k async for k in r.scan_iter(match="rl:*:speech")]
    if stale:
        await r.delete(*stale)


# ------------------------------------------------------------- the Meta transcriber


def test_extract_text_falls_back_to_the_turns_of_a_speech_mode_reply() -> None:
    reply = {"transcript": "", "turns": [{"transcript": "push my"}, {"transcript": "deep work"}]}
    assert extract_text(reply) == ("push my deep work", None)


def test_extract_text_tolerates_response_shapes() -> None:
    assert extract_text({"text": " hi there "}) == ("hi there", None)
    assert extract_text({"transcript": "yo", "language": "en"}) == ("yo", "en")
    assert extract_text({"data": {"text": "nested"}}) == ("nested", None)
    assert extract_text({"unrelated": 1}) == ("", None)
    assert extract_text(["not", "a", "dict"]) == ("", None)


async def test_meta_transcriber_sends_the_request_meta_documents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["url"] = str(request.url)
        seen["ctype"] = request.headers["content-type"]
        seen["body"] = request.content
        return httpx.Response(200, json={"transcript": "buy milk", "language": "en"})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        speech.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    t = MetaTranscriber(
        "sk-test",
        model="muse-voice-transcribe-1.0",
        url="https://api.meta.ai/v1/asr/transcribe",
        timeout=5,
    )
    out = await t.transcribe(WAV, content_type="audio/wav")
    assert (out.text, out.language, out.model) == ("buy milk", "en", "muse-voice-transcribe-1.0")
    assert seen["auth"] == "Bearer sk-test"
    assert seen["url"] == "https://api.meta.ai/v1/asr/transcribe"
    assert str(seen["ctype"]).startswith("multipart/form-data")
    body: bytes = seen["body"]  # type: ignore[assignment]
    # two parts: a JSON `request` part with the settings, and the `audio` file
    assert b'name="request"' in body and b"Content-Type: application/json" in body
    assert b'"mode": "PUSH_TO_TALK"' in body and b'"audioEncoding": "WAV"' in body
    assert b'"model": "muse-voice-transcribe-1.0"' in body
    assert b'name="audio"' in body and WAV in body


async def test_meta_transcriber_maps_failures_to_speech_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    real = httpx.AsyncClient

    def install(handler):  # type: ignore[no-untyped-def]
        monkeypatch.setattr(
            speech.httpx,
            "AsyncClient",
            lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
        )

    t = MetaTranscriber("k", model="m", url="https://x/y", timeout=5)
    install(lambda r: httpx.Response(500))
    with pytest.raises(SpeechError, match="unavailable"):
        await t.transcribe(WAV, content_type="audio/wav")
    install(lambda r: httpx.Response(400, text="audio longer than the cap"))
    with pytest.raises(SpeechError, match="unavailable"):
        await t.transcribe(WAV, content_type="audio/wav")
    install(lambda r: httpx.Response(200, content=b"not json"))
    with pytest.raises(SpeechError, match="unavailable"):
        await t.transcribe(WAV, content_type="audio/wav")
    install(lambda r: httpx.Response(200, content=json.dumps({"text": "  "}).encode()))
    with pytest.raises(SpeechError, match="no speech"):
        await t.transcribe(WAV, content_type="audio/wav")


def test_default_url_derives_from_the_meta_base(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "muse_voice_url", "")
    monkeypatch.setattr(s, "meta_api_base_url", "https://api.meta.ai/v1/")
    assert speech.transcribe_url() == "https://api.meta.ai/v1/asr/transcribe"
    monkeypatch.setattr(s, "muse_voice_url", "https://custom/asr")
    assert speech.transcribe_url() == "https://custom/asr"


async def test_audio_is_processed_in_memory_and_never_stored(
    client: AsyncClient,
    auth_headers: Headers,
    _tmp_media,
    session,  # type: ignore[no-untyped-def]
) -> None:
    from sqlalchemy import func, select

    from app.db.models import ChatMessage

    assert (await _post(client, auth_headers)).status_code == 200
    # nothing was written under the media directory, and a transcription isn't a chat message
    assert [p for p in _tmp_media.rglob("*") if p.is_file()] == []
    assert await session.scalar(select(func.count()).select_from(ChatMessage)) == 0
