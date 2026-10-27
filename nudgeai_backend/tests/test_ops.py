"""Health and metrics endpoints."""

from __future__ import annotations

from httpx import AsyncClient


async def test_health_reports_both_backends(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["database"] == "up"
    # Redis may be down in CI; the contract is that it is reported, not fatal.
    assert body["redis"] in {"up", "down"}
    assert body["status"] == "ok"


async def test_metrics_exposes_prometheus_text(client: AsyncClient) -> None:
    r = await client.get("/metrics")
    assert r.status_code == 200
    assert "text/plain" in r.headers["content-type"]
    assert "nudgeai_users_total" in r.text


async def test_root_advertises_phase(client: AsyncClient) -> None:
    r = await client.get("/")
    assert r.status_code == 200
    assert r.json()["phase"] == "1"


async def test_openapi_is_generated(client: AsyncClient) -> None:
    r = await client.get("/openapi.json")
    assert r.status_code == 200
    paths = r.json()["paths"]
    for expected in (
        "/api/v1/auth/signup",
        "/api/v1/auth/login",
        "/api/v1/habits",
        "/api/v1/tasks",
        "/api/v1/memories/search",
        "/health",
    ):
        assert expected in paths, f"missing {expected}"
