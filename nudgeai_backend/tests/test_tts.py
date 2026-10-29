"""Spoken output: the endpoint, the ElevenLabs request, caching and failure handling."""

from __future__ import annotations

import json

import httpx
import pytest
from httpx import AsyncClient

from app.ai import tts
from app.ai.tts import (
    CachedSynthesizer,
    ElevenLabsSynthesizer,
    FakeSynthesizer,
    NotConfigured,
    SynthesisError,
)

API = "/api/v1"
Headers = dict[str, str]


@pytest.fixture(autouse=True)
def fake_synth():  # type: ignore[no-untyped-def]
    fake = FakeSynthesizer()
    tts.set_synthesizer(fake)
    yield fake
    tts.set_synthesizer(None)


async def _say(client: AsyncClient, h: Headers, text: str = "Hello Ada"):  # type: ignore[no-untyped-def]
    return await client.post(f"{API}/speech/synthesize", json={"text": text}, headers=h)


async def test_returns_mp3_audio_for_the_text(
    client: AsyncClient, auth_headers: Headers, fake_synth: FakeSynthesizer
) -> None:
    r = await _say(client, auth_headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "audio/mpeg"
    assert r.content == b"ID3fake-mp3:Hello Ada"
    assert fake_synth.calls == ["Hello Ada"]


async def test_tidies_whitespace_before_speaking(
    client: AsyncClient, auth_headers: Headers, fake_synth: FakeSynthesizer
) -> None:
    await _say(client, auth_headers, "  Hello \n\n  Ada   ")
    assert fake_synth.calls == ["Hello Ada"]


async def test_rejects_empty_and_oversized_text(
    client: AsyncClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    assert (await _say(client, auth_headers, "")).status_code == 422
    assert (await _say(client, auth_headers, "   \n ")).status_code == 422
    monkeypatch.setattr(get_settings(), "tts_max_chars", 20)
    too_long = await _say(client, auth_headers, "x" * 21)
    assert too_long.status_code == 413 and "20 characters" in too_long.json()["detail"]
    assert (await _say(client, auth_headers, "x" * 20)).status_code == 200


async def test_requires_sign_in(client: AsyncClient) -> None:
    r = await client.post(f"{API}/speech/synthesize", json={"text": "hi"})
    assert r.status_code == 401


async def test_says_so_when_spoken_output_is_not_set_up(
    client: AsyncClient, auth_headers: Headers
) -> None:
    tts.set_synthesizer(None)  # no override and no ELEVENLABS_API_KEY in the test settings
    r = await _say(client, auth_headers)
    assert r.status_code == 503 and "not set up" in r.json()["detail"]


async def test_a_failing_service_is_a_502_not_a_crash(
    client: AsyncClient, auth_headers: Headers
) -> None:
    class Broken:
        async def synthesize(self, text: str):  # type: ignore[no-untyped-def]
            raise SynthesisError("voice output is unavailable right now")

    tts.set_synthesizer(Broken())
    r = await _say(client, auth_headers)
    assert r.status_code == 502 and "unavailable" in r.json()["detail"]


async def test_is_rate_limited(
    client: AsyncClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings
    from app.infra.redis import get_redis

    s = get_settings()
    monkeypatch.setattr(s, "rate_limits_enabled", True)
    monkeypatch.setattr(s, "rate_limit_tts_per_minute", 2)
    r = get_redis()
    for k in [k async for k in r.scan_iter(match="rl:*:tts")]:
        await r.delete(k)
    codes = [(await _say(client, auth_headers)).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    for k in [k async for k in r.scan_iter(match="rl:*:tts")]:
        await r.delete(k)


# ------------------------------------------------------------------- the ElevenLabs request


_REAL_CLIENT = (
    httpx.AsyncClient
)  # captured once, so installing a second fake doesn't wrap the first


def _install(monkeypatch: pytest.MonkeyPatch, handler):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        tts.httpx,
        "AsyncClient",
        lambda **kw: _REAL_CLIENT(transport=httpx.MockTransport(handler), **kw),
    )


def _elevenlabs() -> ElevenLabsSynthesizer:
    return ElevenLabsSynthesizer(
        "xi-secret",
        voice_id="voice123",
        model_id="eleven_flash_v2_5",
        base_url="https://api.elevenlabs.io/",
        timeout=5,
    )


async def test_elevenlabs_request_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers["xi-api-key"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, content=b"MP3BYTES", headers={"content-type": "audio/mpeg"})

    _install(monkeypatch, handler)
    audio = await _elevenlabs().synthesize("Hello there")
    assert audio.data == b"MP3BYTES" and audio.content_type == "audio/mpeg"
    assert seen["url"] == (
        "https://api.elevenlabs.io/v1/text-to-speech/voice123?output_format=mp3_44100_64"
    )
    assert seen["key"] == "xi-secret"
    assert seen["body"] == {"text": "Hello there", "model_id": "eleven_flash_v2_5"}


async def test_elevenlabs_errors_become_synthesis_errors_and_never_log_the_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    import logging

    _install(monkeypatch, lambda r: httpx.Response(401, text='{"detail":"invalid api key"}'))
    with caplog.at_level(logging.WARNING, logger="app.ai.tts"):
        with pytest.raises(SynthesisError, match="unavailable"):
            await _elevenlabs().synthesize("my private reminder")
    assert "HTTP 401" in caplog.text and "invalid api key" in caplog.text
    assert "my private reminder" not in caplog.text and "xi-secret" not in caplog.text

    _install(monkeypatch, lambda r: httpx.Response(200, content=b""))
    with pytest.raises(SynthesisError):
        await _elevenlabs().synthesize("hi")

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    _install(monkeypatch, boom)
    with pytest.raises(SynthesisError, match="unavailable"):
        await _elevenlabs().synthesize("hi")


async def test_the_elevenlabs_connection_is_reused_between_sentences(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A fresh connection per sentence measured at ~1.5 s extra on the first request of a burst."""
    created: list[int] = []

    def factory(**kw):  # type: ignore[no-untyped-def]
        created.append(1)
        return _REAL_CLIENT(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"MP3")), **kw
        )

    monkeypatch.setattr(tts.httpx, "AsyncClient", factory)
    synth = _elevenlabs()
    for text in ("one", "two", "three"):
        await synth.synthesize(text)
    assert len(created) == 1
    await synth.aclose()
    await synth.synthesize("four")  # reopened on demand after a close
    assert len(created) == 2
    await synth.aclose()


async def test_repeated_lines_are_only_paid_for_once() -> None:
    fake = FakeSynthesizer()
    cached = CachedSynthesizer(fake, entries=2, scope="v:m")
    a1 = await cached.synthesize("one")
    a2 = await cached.synthesize("one")
    assert a1 is a2 and fake.calls == ["one"]
    await cached.synthesize("two")
    await cached.synthesize("three")  # evicts the oldest ("one")
    await cached.synthesize("one")
    assert fake.calls == ["one", "two", "three", "one"]


async def test_a_different_voice_is_not_served_from_another_voices_cache() -> None:
    fake = FakeSynthesizer()
    first = CachedSynthesizer(fake, entries=4, scope="voiceA:m")
    second = CachedSynthesizer(fake, entries=4, scope="voiceB:m")
    await first.synthesize("hi")
    await second.synthesize("hi")
    assert fake.calls == ["hi", "hi"]
    assert first._key("hi") != second._key("hi")


def test_no_key_means_off(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    tts.set_synthesizer(None)
    monkeypatch.setattr(get_settings(), "elevenlabs_api_key", "")
    with pytest.raises(NotConfigured):
        tts.get_synthesizer()
    monkeypatch.setattr(get_settings(), "elevenlabs_api_key", "xi-key")
    monkeypatch.setattr(get_settings(), "force_fake_models", False)
    assert isinstance(tts.get_synthesizer(), CachedSynthesizer)
