"""Expo push notification transport.

Thin and replaceable: the rest of the app calls :func:`send_expo` with ready-made messages and
reads back one ticket per message. Delivery is best effort; a failing push service must never
fail the worker pass that produced the nudge.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

# Expo accepts at most 100 messages per request.
BATCH_SIZE = 100


async def send_expo(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Send messages and return one ticket per message, in order.

    A ticket is ``{"status": "ok", "id": ...}`` or ``{"status": "error", "message": ...,
    "details": {"error": "DeviceNotRegistered"}}``. A transport failure yields an error ticket for
    every message in the failed batch rather than raising.
    """
    s = get_settings()
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if s.expo_access_token:
        headers["Authorization"] = f"Bearer {s.expo_access_token}"

    tickets: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=s.push_timeout_seconds) as http:
        for start in range(0, len(messages), BATCH_SIZE):
            batch = messages[start : start + BATCH_SIZE]
            try:
                resp = await http.post(s.expo_push_url, json=batch, headers=headers)
                resp.raise_for_status()
                data = resp.json().get("data", [])
                if len(data) != len(batch):
                    raise ValueError(f"expected {len(batch)} tickets, got {len(data)}")
            except Exception as exc:  # noqa: BLE001 - best-effort delivery
                log.warning("expo push batch failed: %s", exc)
                data = [{"status": "error", "message": str(exc)} for _ in batch]
            tickets.extend(data)
    return tickets
