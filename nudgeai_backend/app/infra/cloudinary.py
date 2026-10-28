"""Cloudinary over its REST API: signed uploads, deletes and delivery URLs.

Requests are signed with the account secret (SHA-1 over the sorted parameters), so the app can
upload straight to Cloudinary using a signature we hand out, and we can check afterwards that
an image URL is one we allowed. No SDK: httpx is already here and this stays easy to fake.
"""

from __future__ import annotations

import hashlib
import re
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx

from app.core.config import get_settings

API = "https://api.cloudinary.com/v1_1"
DELIVERY_HOST = "res.cloudinary.com"
AVATAR_FORMATS = "png,jpg,jpeg,webp"
# Applied on arrival: a square crop centred on the face, so every avatar is the same shape.
AVATAR_INCOMING = "c_fill,g_face,w_512,h_512"
# Applied on delivery: small, in the best format and quality the device can show.
THUMB = "c_fill,g_face,w_96,h_96,f_auto,q_auto"


class CloudinaryError(Exception):
    pass


def sign(params: dict[str, Any], secret: str) -> str:
    """Cloudinary's signature: sorted ``k=v`` pairs joined by ``&``, secret appended, SHA-1."""
    body = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v not in (None, ""))
    return hashlib.sha1(f"{body}{secret}".encode(), usedforsecurity=False).hexdigest()  # noqa: S324


def avatar_folder() -> str:
    return f"{get_settings().cloudinary_folder}/avatars".strip("/")


@dataclass(frozen=True, slots=True)
class UploadIntent:
    upload_url: str
    fields: dict[str, str]


def avatar_intent(user_id: UUID, public_suffix: str) -> UploadIntent:
    """Everything the app must send to Cloudinary to upload this user's avatar directly.

    The public id starts with the user's id and is part of the signature, so one user cannot
    upload into another's slot, and ``allowed_formats`` is signed too.
    """
    s = get_settings()
    params = {
        "folder": avatar_folder(),
        "public_id": f"{user_id}-{public_suffix}",
        "timestamp": str(int(time.time())),
        "allowed_formats": AVATAR_FORMATS,
        "transformation": AVATAR_INCOMING,
    }
    fields = {
        **params,
        "api_key": s.cloudinary_api_key,
        "signature": sign(params, s.cloudinary_api_secret),
    }
    return UploadIntent(upload_url=f"{API}/{s.cloudinary_cloud_name}/image/upload", fields=fields)


async def _post(path: str, *, data: dict[str, str], files: Any = None) -> dict[str, Any]:
    s = get_settings()
    url = f"{API}/{s.cloudinary_cloud_name}/{path}"
    try:
        async with httpx.AsyncClient(timeout=s.cloudinary_timeout_seconds) as http:
            resp = await http.post(url, data=data, files=files)
    except httpx.HTTPError as exc:
        raise CloudinaryError(f"cloudinary unreachable: {exc}") from exc
    if resp.status_code != 200:
        raise CloudinaryError(f"cloudinary said {resp.status_code}: {resp.text[:200]}")
    body: dict[str, Any] = resp.json()
    return body


async def upload_avatar(user_id: UUID, public_suffix: str, data: bytes, ext: str) -> str:
    """Upload image bytes for one user and return the delivery URL."""
    intent = avatar_intent(user_id, public_suffix)
    mime = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ext]
    body = await _post(
        "image/upload", data=intent.fields, files={"file": (f"avatar.{ext}", data, mime)}
    )
    url = body.get("secure_url")
    if not isinstance(url, str):
        raise CloudinaryError("cloudinary reply had no secure_url")
    return url


async def destroy(public_id: str) -> None:
    s = get_settings()
    params = {"public_id": public_id, "timestamp": str(int(time.time())), "invalidate": "true"}
    await _post(
        "image/destroy",
        data={
            **params,
            "api_key": s.cloudinary_api_key,
            "signature": sign(params, s.cloudinary_api_secret),
        },
    )


def _avatar_pattern(cloud: str, user_id: UUID | None) -> re.Pattern[str]:
    who = re.escape(str(user_id)) if user_id else r"[0-9a-f-]{36}"
    folder = re.escape(avatar_folder())
    return re.compile(
        rf"^https://{re.escape(DELIVERY_HOST)}/{re.escape(cloud)}/image/upload/"
        rf"(?:v\d+/)?(?P<public_id>{folder}/{who}-[0-9a-f]{{8}})(?:\.[a-z0-9]{{3,4}})?$"
    )


def avatar_public_id(url: str, user_id: UUID | None = None) -> str | None:
    """The public id behind one of *our* avatar URLs (optionally one owned by ``user_id``)."""
    cloud = get_settings().cloudinary_cloud_name
    if not cloud:
        return None
    match = _avatar_pattern(cloud, user_id).match(url)
    return match.group("public_id") if match else None


def thumb_url(url: str | None) -> str | None:
    """A small, optimised version of a Cloudinary image URL; other URLs are returned as is."""
    if not url or f"{DELIVERY_HOST}/" not in url or "/image/upload/" not in url:
        return url
    return url.replace("/image/upload/", f"/image/upload/{THUMB}/", 1)
