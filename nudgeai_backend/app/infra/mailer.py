"""Transactional email through Resend.

The Resend SDK is synchronous and configured through a module-level API key, so
sends run in a worker thread and the key is applied per call. Delivery is best
effort: a failed send is logged and reported as ``False``, never raised, because
the caller has already committed the code the user is waiting for (they can ask
for a new one).
"""

from __future__ import annotations

import asyncio
import logging

import resend

from app.core.config import get_settings

log = logging.getLogger(__name__)


def mail_configured() -> bool:
    return bool(get_settings().resend_api_key)


def _send_sync(params: resend.Emails.SendParams, api_key: str) -> None:
    resend.api_key = api_key
    resend.Emails.send(params)


async def send_email(*, to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Send one email. Returns True when Resend accepted it."""
    s = get_settings()
    if not s.resend_api_key:
        log.debug("RESEND_API_KEY not set; not sending %r to %s", subject, to)
        return False
    params: resend.Emails.SendParams = {
        "from": s.email_from,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        params["text"] = text
    try:
        await asyncio.to_thread(_send_sync, params, s.resend_api_key)
    except Exception as exc:  # noqa: BLE001 - best-effort delivery
        log.warning("email %r to %s failed: %s", subject, to, exc)
        return False
    return True


def code_email(*, code: str, purpose: str, ttl_minutes: int) -> tuple[str, str, str]:
    """Subject, HTML and plain text for a one-time code."""
    what = "verify your email" if purpose == "email_verification" else "reset your password"
    subject = f"Your Nudge code: {code}"
    text = (
        f"Use this code to {what}: {code}\n"
        f"It expires in {ttl_minutes} minutes. If you didn't ask for it, you can ignore this email."
    )
    html = (
        '<div style="font-family:Inter,Arial,sans-serif;max-width:420px;margin:auto">'
        f"<p>Use this code to {what}:</p>"
        f'<p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#C15EFF">{code}</p>'
        f"<p>It expires in {ttl_minutes} minutes. "
        "If you didn't ask for it, you can ignore this email.</p></div>"
    )
    return subject, html, text
