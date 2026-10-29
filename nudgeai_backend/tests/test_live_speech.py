"""The live transcription relay, with both ends faked: no sockets, no Meta, no spend."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import pytest

from app.ai import live_speech
from app.ai.live_speech import LiveError, run_session

AUDIO = b"\x01\x02" * 1280  # 80 ms of 16 kHz PCM


class FakeChannel:
    """The phone: frames go in through `feed`, what the relay says comes out in `sent`."""

    def __init__(self) -> None:
        self.inbox: asyncio.Queue[tuple[str, bytes | str]] = asyncio.Queue()
        self.sent: list[dict[str, Any]] = []

    async def receive(self) -> tuple[str, bytes | str]:
        return await self.inbox.get()

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(data)

    def audio(self, data: bytes = AUDIO) -> None:
        self.inbox.put_nowait(("bytes", data))

    def stop(self) -> None:
        self.inbox.put_nowait(("text", json.dumps({"type": "stop"})))

    def leave(self) -> None:
        self.inbox.put_nowait(("closed", ""))

    def kinds(self) -> list[str]:
        return [m["type"] for m in self.sent]


class FakeUpstream:
    """Meta: `say()` queues events it will send; `finish()` ends its stream cleanly."""

    def __init__(self) -> None:
        self.audio: list[bytes] = []
        self.ended = False
        self.closed = False
        self._events: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def say(self, **event: Any) -> None:
        self._events.put_nowait(event)

    def finish(self) -> None:
        self._events.put_nowait(None)

    async def send_audio(self, pcm: bytes) -> None:
        self.audio.append(pcm)

    async def end(self) -> None:
        self.ended = True

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        while True:
            event = await self._events.get()
            if event is None:
                return
            yield event

    async def close(self) -> None:
        self.closed = True


def opener(upstream: FakeUpstream):  # type: ignore[no-untyped-def]
    async def open_upstream() -> FakeUpstream:
        return upstream

    return open_upstream


async def tick() -> None:
    await asyncio.sleep(0.01)


async def test_a_sentence_is_streamed_and_finished_hands_free() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=5)
    )
    phone.audio()
    phone.audio()
    meta.say(type="speechStart", turnId=0)
    meta.say(type="transcript", transcript="push my", final=False)
    meta.say(type="transcript", transcript="push my deep work", final=False)
    meta.say(type="speechEnd", turnId=0)
    meta.say(type="speechComplete", turnId=0, transcript="push my deep work to 11 am please")
    await tick()
    phone.leave()
    await session

    assert phone.sent == [
        {"type": "ready"},
        {"type": "speech", "active": True},
        {"type": "partial", "text": "push my"},
        {"type": "partial", "text": "push my deep work"},
        {"type": "speech", "active": False},
        {"type": "turn", "text": "push my deep work to 11 am please"},
    ]
    assert meta.audio == [AUDIO, AUDIO]  # forwarded as is, in order
    assert meta.closed


async def test_tapping_stop_ends_the_stream_and_returns_the_final_words() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="PUSH_TO_TALK", max_seconds=5)
    )
    phone.audio()
    meta.say(type="transcript", transcript="buy milk", final=False)
    await tick()
    phone.stop()
    await tick()
    assert meta.ended  # we told Meta the audio is over
    meta.say(type="transcript", transcript="Buy milk.", final=True)
    meta.finish()
    await session
    assert phone.sent[-1] == {"type": "turn", "text": "Buy milk."}
    assert phone.kinds().count("turn") == 1


async def test_if_meta_never_announces_a_sentence_the_last_words_are_used() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=5)
    )
    meta.say(type="transcript", transcript="call the dentist", final=False)
    await tick()
    phone.stop()
    await tick()
    meta.finish()  # closed without a speechComplete or a final
    await session
    assert phone.sent[-1] == {"type": "turn", "text": "call the dentist"}


async def test_a_silent_meta_after_stop_does_not_hang_the_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(live_speech, "STOP_GRACE_SECONDS", 0.05)
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=5)
    )
    meta.say(type="transcript", transcript="hello there", final=False)
    await tick()
    phone.stop()
    await asyncio.wait_for(session, 1)  # returns by itself, not at the 5 s limit
    assert phone.sent[-1] == {"type": "turn", "text": "hello there"}


async def test_a_stray_double_period_from_meta_is_tidied_but_an_ellipsis_is_kept() -> None:
    for heard, shown in (("please..", "please."), ("well... maybe", "well... maybe")):
        phone, meta = FakeChannel(), FakeUpstream()
        session = asyncio.create_task(
            run_session(phone, opener(meta), mode="PUSH_TO_TALK", max_seconds=5)
        )
        meta.say(type="transcript", transcript=heard, final=True)
        await tick()
        phone.leave()
        await session
        assert phone.sent[-1] == {"type": "turn", "text": shown}


async def test_a_finished_sentence_is_only_announced_once() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="PUSH_TO_TALK", max_seconds=5)
    )
    meta.say(type="transcript", transcript="Hello.", final=True)
    meta.say(type="speechComplete", turnId=0, transcript="Hello.")
    await tick()
    phone.leave()
    await session
    assert phone.kinds().count("turn") == 1


async def test_nothing_is_announced_when_the_phone_just_leaves() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=5)
    )
    meta.say(type="transcript", transcript="half a sentence", final=False)
    await tick()
    phone.leave()
    await session
    assert "turn" not in phone.kinds()
    assert meta.closed  # and Meta's side is cleaned up


async def test_a_meta_error_is_reported_without_leaking_its_details() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=5)
    )
    meta.say(type="error", message="internal stack trace with secrets")
    with pytest.raises(LiveError) as caught:
        await session
    assert caught.value.code == "unavailable"
    assert "secrets" not in caught.value.message
    assert meta.closed


async def test_too_much_audio_stops_the_session() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=0.1)  # ~4 KB budget
    )
    for _ in range(5):
        phone.audio()
    with pytest.raises(LiveError) as caught:
        await session
    assert caught.value.code == "limit"
    assert meta.closed


async def test_a_session_ends_at_its_time_limit() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    with pytest.raises(LiveError) as caught:
        await run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=0.05)
    assert caught.value.code == "limit"
    assert meta.closed


async def test_an_upstream_that_cannot_connect_is_reported_before_ready() -> None:
    phone = FakeChannel()

    async def failing() -> FakeUpstream:
        raise LiveError("unavailable", "live transcription is unavailable right now")

    with pytest.raises(LiveError):
        await run_session(phone, failing, mode="ENDPOINTING", max_seconds=5)
    assert phone.sent == []  # never told the phone it could start talking


async def test_garbage_text_frames_are_ignored() -> None:
    phone, meta = FakeChannel(), FakeUpstream()
    session = asyncio.create_task(
        run_session(phone, opener(meta), mode="ENDPOINTING", max_seconds=5)
    )
    phone.inbox.put_nowait(("text", "not json"))
    phone.inbox.put_nowait(("text", json.dumps({"type": "something-else"})))
    phone.audio()
    await tick()
    phone.leave()
    await session
    assert meta.audio == [AUDIO] and not meta.ended
