"""Avatar storage on local disk, served read-only under /media.

Files are named ``<user id>-<random>.<ext>`` so a new upload changes the URL (clients cache
by URL). The image type is decided from the file's own bytes, never from the client's
Content-Type or filename, and the size is capped while streaming.
"""

from __future__ import annotations

import contextlib
import secrets
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import UUID

from app.core.config import get_settings

MEDIA_URL = "/media"
AVATAR_DIR = "avatars"


class UploadError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        self.status = status
        self.detail = detail
        super().__init__(detail)


def sniff_image(data: bytes) -> str | None:
    """File extension for a PNG, JPEG or WebP, judged by magic bytes; else None."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def media_root() -> Path:
    return Path(get_settings().media_dir)


def _avatar_path(url: str) -> Path | None:
    """The on-disk file for one of our avatar URLs; None for anything else."""
    prefix = f"{MEDIA_URL}/{AVATAR_DIR}/"
    if not url.startswith(prefix):
        return None
    name = url.removeprefix(prefix)
    if "/" in name or ".." in name:
        return None
    return media_root() / AVATAR_DIR / name


def remove_avatar_file(url: str | None) -> None:
    if not url:
        return
    path = _avatar_path(url)
    if path is not None:
        with contextlib.suppress(OSError):
            path.unlink()


async def store_avatar(user_id: UUID, chunks: AsyncIterator[bytes]) -> str:
    """Read the upload (bounded), validate it is an image, write it, and return its URL."""
    limit = get_settings().avatar_max_bytes
    buf = bytearray()
    async for chunk in chunks:
        buf.extend(chunk)
        if len(buf) > limit:
            raise UploadError(413, f"image is larger than {limit // 1_000_000} MB")
    if not buf:
        raise UploadError(400, "no image in the request body")
    ext = sniff_image(bytes(buf[:16]))
    if ext is None:
        raise UploadError(415, "unsupported image; use PNG, JPEG or WebP")

    directory = media_root() / AVATAR_DIR
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{user_id}-{secrets.token_hex(4)}.{ext}"
    (directory / name).write_bytes(bytes(buf))
    return f"{MEDIA_URL}/{AVATAR_DIR}/{name}"
