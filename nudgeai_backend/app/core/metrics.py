"""Prometheus collectors for the whole app.

Lives in `core` so the router, executor, and services can record without
importing the API layer. `api/v1/ops.py` re-exports these and serves them.
"""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

# ---------------------------------------------------------------- phase 1
signups_total = Counter("nudgeai_signups_total", "Signups completed", ["result"])
memory_writes_total = Counter("nudgeai_memory_writes_total", "Memories written", ["kind"])
memory_searches_total = Counter("nudgeai_memory_searches_total", "Memory searches")
users_total = Gauge("nudgeai_users_total", "Registered users")

# ---------------------------------------------------------------- phase 2
model_calls_total = Counter(
    "nudgeai_model_calls_total", "Chat completion calls", ["model", "tier", "result"]
)
model_tokens_total = Counter(
    "nudgeai_model_tokens_total", "Tokens consumed", ["model", "direction"]
)
model_cost_usd_total = Counter("nudgeai_model_cost_usd_total", "Estimated spend in USD", ["model"])
model_latency_seconds = Histogram(
    "nudgeai_model_latency_seconds",
    "End-to-end model call latency",
    ["model"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60),
)

route_decisions_total = Counter(
    "nudgeai_route_decisions_total", "Router tier decisions", ["tier", "reason"]
)
route_escalations_total = Counter(
    "nudgeai_route_escalations_total", "Escalations up a tier", ["from_tier", "to_tier"]
)
budget_rejections_total = Counter(
    "nudgeai_budget_rejections_total", "Turns pinned to the fast tier by the budget guard"
)
cache_lookups_total = Counter(
    "nudgeai_response_cache_lookups_total", "Response cache lookups", ["result"]
)

tool_calls_total = Counter(
    "nudgeai_tool_calls_total", "Tool invocations and proposals", ["tool", "result"]
)
proposals_total = Counter(
    "nudgeai_proposals_total", "Confirmation-gate outcomes", ["tool", "outcome"]
)
chat_messages_total = Counter("nudgeai_chat_messages_total", "Chat messages persisted", ["role"])

# ---------------------------------------------------------------- phase 3
nudge_decisions_total = Counter(
    "nudgeai_nudge_decisions_total", "Engine decisions", ["action", "rule"]
)
nudge_worker_runs_total = Counter("nudgeai_nudge_worker_runs_total", "Worker passes", ["result"])


def record_model_call(
    *,
    model: str,
    tier: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
    latency_seconds: float,
    result: str = "ok",
) -> None:
    """One place that records a call, so no path can forget the cost."""
    model_calls_total.labels(model=model, tier=tier, result=result).inc()
    if prompt_tokens:
        model_tokens_total.labels(model=model, direction="prompt").inc(prompt_tokens)
    if completion_tokens:
        model_tokens_total.labels(model=model, direction="completion").inc(completion_tokens)
    if cost_usd:
        model_cost_usd_total.labels(model=model).inc(cost_usd)
    model_latency_seconds.labels(model=model).observe(latency_seconds)
