"""The /speech/live WebSocket: who may connect, what the first frame must be, and a full session."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from starlette.testclient import TestClient, WebSocketDisconnect

from app.ai import live_speech
from app.ai.live_speech import LiveError
from app.core.config import get_settings
from app.core.security import create_access_token
from app.main import create_app
from tests.test_live_speech import FakeUpstream

PATH = "/api/v1/speech/live"
USER = uuid4()


class NoSlot:
    """Stands in for the Redis-backed one-session-at-a-time guard."""

    def __init__(self, user_id: object) -> None:
        pass

    async def __aenter__(self) -> NoSlot:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None


@pytest.fixture
def app_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    async def trust_any_token(token: object) -> object:
        if token != "good-token":
            raise LiveError("unauthorized", "please sign in again")
        return USER

    monkeypatch.setattr(live_speech, "authenticate", trust_any_token)
    monkeypatch.setattr(live_speech, "Slot", NoSlot)
    # No `with`: the app's startup (database, redis) isn't needed for a WebSocket relay test.
    yield TestClient(create_app())


def _expect_error(ws: Any, code: str) -> None:
    message = ws.receive_json()
    assert message["type"] == "error" and message["code"] == code, message
    with pytest.raises(WebSocketDisconnect):
        ws.receive_json()


def test_a_bad_token_is_refused_and_the_connection_closed(app_client: TestClient) -> None:
    with app_client.websocket_connect(PATH) as ws:
        ws.send_json({"type": "start", "token": "nope"})
        _expect_error(ws, "unauthorized")


def test_the_first_frame_must_be_a_start_message(app_client: TestClient) -> None:
    with app_client.websocket_connect(PATH) as ws:
        ws.send_json({"type": "audio"})
        _expect_error(ws, "bad_request")
    with app_client.websocket_connect(PATH) as ws:
        ws.send_text("not json at all")
        _expect_error(ws, "bad_request")


def test_the_real_signed_token_check_rejects_forgeries_and_wrong_token_types() -> None:
    # The un-patched `authenticate`: no database needed because both fail before the lookup.
    import asyncio

    for bad in (None, "", "garbage", create_access_token(uuid4()) + "x"):
        with pytest.raises(LiveError) as caught:
            asyncio.run(live_speech.authenticate(bad))
        assert caught.value.code == "unauthorized"


def test_it_can_be_switched_off(app_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "live_speech_enabled", False)
    with app_client.websocket_connect(PATH) as ws:
        _expect_error(ws, "unavailable")


def test_a_full_session_streams_words_back_and_finishes_the_sentence(
    app_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    meta = FakeUpstream()
    seen: dict[str, Any] = {}

    def factory(mode: str, keywords: list[str] | None = None) -> Any:
        seen.update(mode=mode, keywords=keywords)

        async def open_upstream() -> FakeUpstream:
            return meta

        return open_upstream

    monkeypatch.setattr(live_speech, "meta_upstream_factory", factory)
    meta.say(type="transcript", transcript="push my deep work", final=False)
    meta.say(type="speechComplete", turnId=0, transcript="push my deep work to 11 am please")

    with app_client.websocket_connect(PATH) as ws:
        ws.send_text(
            json.dumps(
                {
                    "type": "start",
                    "token": "good-token",
                    "mode": "ENDPOINTING",
                    "keywords": ["Nudge", 5],
                }
            )
        )
        assert ws.receive_json() == {"type": "ready"}
        ws.send_bytes(b"\x01\x02" * 1280)
        assert ws.receive_json() == {"type": "partial", "text": "push my deep work"}
        assert ws.receive_json() == {"type": "turn", "text": "push my deep work to 11 am please"}

    assert seen == {"mode": "ENDPOINTING", "keywords": ["Nudge"]}  # junk keywords are dropped
    assert meta.audio == [b"\x01\x02" * 1280]
    assert meta.closed


def test_an_unknown_mode_falls_back_to_hands_free(
    app_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    modes: list[str] = []

    def factory(mode: str, keywords: list[str] | None = None) -> Any:
        modes.append(mode)

        async def open_upstream() -> FakeUpstream:
            return FakeUpstream()

        return open_upstream

    monkeypatch.setattr(live_speech, "meta_upstream_factory", factory)
    with app_client.websocket_connect(PATH) as ws:
        ws.send_json({"type": "start", "token": "good-token", "mode": "DIARIZATION"})
        assert ws.receive_json() == {"type": "ready"}
    assert modes == ["ENDPOINTING"]
