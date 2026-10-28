"""Avatars on Cloudinary: server upload, direct-upload intent, attach, cleanup, thumbnails."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.infra import cloudinary
from app.infra.cloudinary import CloudinaryError, sign

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
CLOUD = "democloud"


class FakeCloudinary:
    """Stands in for the Cloudinary API: records calls, answers like the real thing."""

    def __init__(self) -> None:
        self.uploads: list[dict[str, Any]] = []
        self.destroyed: list[str] = []
        self.fail = False
        self.version = 1700000000

    async def post(self, path: str, *, data: dict[str, str], files: Any = None) -> dict[str, Any]:
        if self.fail:
            raise CloudinaryError("boom")
        if path == "image/destroy":
            self.destroyed.append(data["public_id"])
            return {"result": "ok"}
        self.uploads.append({"data": data, "file": files["file"] if files else None})
        self.version += 1
        pid = f"{data['folder']}/{data['public_id']}"
        return {
            "public_id": pid,
            "secure_url": f"https://res.cloudinary.com/{CLOUD}/image/upload/v{self.version}/{pid}.png",
        }


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeCloudinary:
    s = get_settings()
    monkeypatch.setattr(s, "cloudinary_cloud_name", CLOUD)
    monkeypatch.setattr(s, "cloudinary_api_key", "key123")
    monkeypatch.setattr(s, "cloudinary_api_secret", "shh-secret")
    f = FakeCloudinary()
    monkeypatch.setattr(cloudinary, "_post", f.post)
    return f


async def _me(client: AsyncClient, h: dict[str, str]) -> dict[str, Any]:
    return (await client.get(f"{API}/profile", headers=h)).json()


def test_signature_matches_cloudinarys_documented_example() -> None:
    params = {
        "eager": "w_400,h_300,c_pad|w_260,h_200,c_crop",
        "public_id": "sample_image",
        "timestamp": "1315060510",
    }
    assert sign(params, "abcd") == "bfd09f95f331f558cbd1320e67aa8d488770583e"


async def test_upload_goes_to_cloudinary_with_a_face_crop_and_returns_a_thumbnail(
    client: AsyncClient, auth_headers: dict[str, str], fake: FakeCloudinary
) -> None:
    r = await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    me = await _me(client, auth_headers)
    assert body["avatar_url"].startswith(f"https://res.cloudinary.com/{CLOUD}/image/upload/v")
    assert f"nudge/avatars/{me['id']}-" in body["avatar_url"]
    sent = fake.uploads[0]["data"]
    assert sent["transformation"] == "c_fill,g_face,w_512,h_512"
    assert sent["allowed_formats"] == "png,jpg,jpeg,webp"
    assert sent["signature"] == sign(
        {k: v for k, v in sent.items() if k not in ("api_key", "signature")}, "shh-secret"
    )
    assert fake.uploads[0]["file"][1] == PNG
    # lists and headers get a small, optimised copy
    assert "/image/upload/c_fill,g_face,w_96,h_96,f_auto,q_auto/v" in body["avatar_thumb_url"]


async def test_replacing_and_removing_deletes_the_old_image(
    client: AsyncClient, auth_headers: dict[str, str], fake: FakeCloudinary
) -> None:
    first = (await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)).json()
    second = (await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)).json()
    assert first["avatar_url"] != second["avatar_url"]
    assert len(fake.destroyed) == 1 and fake.destroyed[0] in first["avatar_url"]
    gone = (await client.delete(f"{API}/profile/avatar", headers=auth_headers)).json()
    assert gone["avatar_url"] is None and gone["avatar_thumb_url"] is None
    assert len(fake.destroyed) == 2 and fake.destroyed[1] in second["avatar_url"]


async def test_cloudinary_outage_gives_a_friendly_retryable_error_and_keeps_the_old_photo(
    client: AsyncClient, auth_headers: dict[str, str], fake: FakeCloudinary
) -> None:
    ok = (await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)).json()
    fake.fail = True
    r = await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)
    assert r.status_code == 503 and "try again" in r.json()["detail"]
    assert (await _me(client, auth_headers))["avatar_url"] == ok["avatar_url"]
    # a failed cleanup never fails the request
    fake.fail = False
    fake_destroy_fail = False  # noqa: F841
    fake.fail = True
    assert (await client.delete(f"{API}/profile/avatar", headers=auth_headers)).status_code == 200


async def test_intent_lets_the_app_upload_directly_then_attach(
    client: AsyncClient, auth_headers: dict[str, str], fake: FakeCloudinary
) -> None:
    me = await _me(client, auth_headers)
    intent = (await client.post(f"{API}/profile/avatar/intent", headers=auth_headers)).json()
    assert intent["method"] == "cloudinary"
    assert intent["upload_url"] == f"https://api.cloudinary.com/v1_1/{CLOUD}/image/upload"
    f = intent["fields"]
    assert f["api_key"] == "key123" and f["public_id"].startswith(me["id"])
    assert f["signature"] == sign(
        {k: v for k, v in f.items() if k not in ("api_key", "signature")}, "shh-secret"
    )

    # the app uploads to Cloudinary itself, then tells us where the image ended up
    url = f"https://res.cloudinary.com/{CLOUD}/image/upload/v1/{f['folder']}/{f['public_id']}.jpg"
    r = await client.put(f"{API}/profile/avatar", json={"url": url}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["avatar_url"] == url
    assert r.json()["avatar_thumb_url"].startswith(
        f"https://res.cloudinary.com/{CLOUD}/image/upload/c_fill"
    )


@pytest.mark.parametrize(
    "bad",
    [
        "https://evil.example/avatar.png",
        "https://res.cloudinary.com/othercloud/image/upload/v1/nudge/avatars/"
        f"{'0' * 36}-abcd1234.png",
        f"https://res.cloudinary.com/{CLOUD}/image/upload/v1/nudge/other/x.png",
        f"http://res.cloudinary.com/{CLOUD}/image/upload/v1/nudge/avatars/x.png",
    ],
)
async def test_attach_rejects_images_that_are_not_this_users(
    client: AsyncClient, auth_headers: dict[str, str], fake: FakeCloudinary, bad: str
) -> None:
    r = await client.put(f"{API}/profile/avatar", json={"url": bad}, headers=auth_headers)
    assert r.status_code == 400


async def test_cannot_attach_another_users_image(
    client: AsyncClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
    fake: FakeCloudinary,
) -> None:
    theirs = (await client.post(f"{API}/profile/avatar", content=PNG, headers=other_headers)).json()
    r = await client.put(
        f"{API}/profile/avatar", json={"url": theirs["avatar_url"]}, headers=auth_headers
    )
    assert r.status_code == 400
    assert fake.destroyed == []  # and nothing of theirs was touched


async def test_without_cloudinary_the_intent_points_at_the_api_and_old_urls_still_work(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    intent = (await client.post(f"{API}/profile/avatar/intent", headers=auth_headers)).json()
    assert intent == {
        "method": "api",
        "max_bytes": get_settings().avatar_max_bytes,
        "upload_url": None,
        "fields": None,
        "file_field": None,
    }
    local = (await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)).json()
    assert local["avatar_url"].startswith("/media/avatars/")
    assert local["avatar_thumb_url"] == local["avatar_url"]  # nothing to optimise on local disk
    attach = await client.put(
        f"{API}/profile/avatar", json={"url": local["avatar_url"]}, headers=auth_headers
    )
    assert attach.status_code == 400  # direct-upload attach is Cloudinary-only


async def test_local_avatar_is_cleaned_up_after_moving_to_cloudinary(
    client: AsyncClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    local = (await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)).json()
    s = get_settings()
    monkeypatch.setattr(s, "cloudinary_cloud_name", CLOUD)
    monkeypatch.setattr(s, "cloudinary_api_key", "k")
    monkeypatch.setattr(s, "cloudinary_api_secret", "s")
    f = FakeCloudinary()
    monkeypatch.setattr(cloudinary, "_post", f.post)
    r = await client.post(f"{API}/profile/avatar", content=PNG, headers=auth_headers)
    assert r.json()["avatar_url"].startswith("https://res.cloudinary.com/")
    assert f.destroyed == []  # the old one was a local file, not a Cloudinary asset
    assert (await client.get(local["avatar_url"])).status_code == 404  # removed from disk


def test_uuid_is_embedded_in_public_id() -> None:
    uid = UUID(int=7)
    intent = cloudinary.avatar_intent(uid, "abcd1234")
    assert intent.fields["public_id"] == f"{uid}-abcd1234"
