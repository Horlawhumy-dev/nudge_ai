"""Gate 2b: live Meta probe. Run explicitly, never in the suite.

Usage (from nudgeai_backend/, with keys in .env):

    uv run python scripts/probe_meta.py

Probes every router tier plus embeddings, printing latency, tokens, and cost
per tier. Exits non-zero if any probed tier fails; each tier reports its own
failure instead of raising, so one outage does not hide the others. Refuses
to run when no live keys are configured, so a bare checkout can never
"pass" against the scripted fake.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.models.client import ModelError, cost_of, get_client  # noqa: E402
from app.models.registry import TIERS, Provider, Tier, spec_for  # noqa: E402


def _provider_live(provider: Provider) -> bool:
    s = get_settings()
    if provider == "meta":
        return bool(s.meta_api_key and s.meta_api_base_url)
    return bool(s.baseten_api_key and s.baseten_base_url)


async def _probe_tier(tier: Tier) -> bool:
    spec = spec_for(tier)
    if not _provider_live(spec.provider):
        print(f"[{tier}] SKIP provider={spec.provider} model={spec.id} (no key configured)")
        return True
    try:
        reply = await get_client().complete(
            spec, [{"role": "user", "content": "Reply with exactly: nudge-ok"}]
        )
    except ModelError as exc:
        print(f"[{tier}] FAIL provider={spec.provider} model={spec.id}: {exc}")
        return False
    print(
        f"[{tier}] ok provider={spec.provider} model={spec.id} "
        f"latency_ms={reply.latency_ms:.0f} "
        f"tokens={reply.prompt_tokens}+{reply.completion_tokens} "
        f"cost_usd={cost_of(reply):.6f} reply={reply.content[:80]!r}"
    )
    return True


async def _probe_embeddings() -> bool:
    from app.infra.embeddings import StaticEmbedder, get_embedder

    embedder = get_embedder()
    if isinstance(embedder, StaticEmbedder):
        print("[embeddings] SKIP StaticEmbedder (no Meta embedding model yet)")
        return True
    try:
        vec = await embedder.embed_one("morning run")
    except Exception as exc:  # noqa: BLE001 — probe reports, never raises
        print(f"[embeddings] FAIL: {exc}")
        return False
    print(f"[embeddings] ok dim={len(vec)} model={get_settings().embedding_model}")
    return True


async def _main() -> int:
    s = get_settings()
    if s.force_fake_models or (not s.meta_api_key and not s.baseten_api_key):
        print("refusing: no live keys configured (this would only probe the fake)")
        return 2
    print(f"tiers: {', '.join(f'{t}={spec_for(t).id}' for t in TIERS)}")
    ok = True
    for tier in TIERS:
        ok = await _probe_tier(tier) and ok
    ok = await _probe_embeddings() and ok
    print("GATE 2b: PASS" if ok else "GATE 2b: FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
