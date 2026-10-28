"""The progress maths: pure functions, hand-checked numbers, no database."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.services import insights as ins
from app.services.insights import HabitFacts, TaskFacts

TODAY = date(2026, 5, 13)  # a Wednesday
NOW = datetime(2026, 5, 13, 12, 0, tzinfo=UTC)


def ago(n: int) -> date:
    return TODAY - timedelta(days=n)


def habit(name: str, *days_ago: int, goal: int = 7, hid: str | None = None) -> HabitFacts:
    return HabitFacts(hid or name, name, "🎯", goal, frozenset(ago(n) for n in days_ago))


def task(
    title: str,
    day_ago: int | None,
    *,
    start: str | None = "09:00",
    done: bool = False,
    due_h: int | None = None,
    done_h: int | None = None,
) -> TaskFacts:
    day = ago(day_ago) if day_ago is not None else None
    due = (
        None
        if day is None
        else datetime(day.year, day.month, day.day, due_h if due_h is not None else 10, tzinfo=UTC)
    )
    done_at = None
    if done:
        base = day or TODAY
        done_at = datetime(
            base.year, base.month, base.day, done_h if done_h is not None else 9, 30, tzinfo=UTC
        )
    return TaskFacts(title, title, day, start, due, done_at)


# ------------------------------------------------------------------------ habits


def test_weekly_bars_are_the_share_of_habits_done_each_day() -> None:
    a, b = habit("A", 0, 1), habit("B", 0)
    bars = ins.habit_bars([a, b], TODAY, "weekly")
    assert [x.label for x in bars] == ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]
    assert [x.value for x in bars] == [0, 0, 0, 0, 0, 50, 100]  # yesterday 1/2, today 2/2


def test_monthly_bars_are_four_weeks_oldest_first() -> None:
    h = habit("A", *range(0, 7))  # all of the latest week
    bars = ins.habit_bars([h], TODAY, "monthly")
    assert [x.label for x in bars] == ["Wk 1", "Wk 2", "Wk 3", "Wk 4"]
    assert [x.value for x in bars] == [0, 0, 0, 100]
    assert ins.habit_bars([], TODAY, "weekly")[0].value == 0  # no habits: zeros, no division


def test_overall_streak_current_and_best() -> None:
    assert ins.overall_streak([habit("A", 0, 1), habit("B", 2)], TODAY) == (3, 3)
    assert ins.overall_streak([habit("A", 1, 2, 3)], TODAY) == (3, 3)  # yesterday keeps it alive
    assert ins.overall_streak([habit("A", 2, 3)], TODAY) == (0, 2)  # broken
    assert ins.overall_streak([habit("A", 0, 5, 6, 7)], TODAY) == (1, 3)
    assert ins.overall_streak([], TODAY) == (0, 0)


def test_consistency_window_starts_at_the_first_checkin() -> None:
    assert ins.consistency([], TODAY) == 0
    # first check-in 3 days ago -> a 4-day window; checked in on 3 of them
    assert ins.consistency([habit("A", 3, 1, 0)], TODAY) == 75
    # 15 check-ins since 28 days ago -> a 29-day window
    assert ins.consistency([habit("A", *range(0, 30, 2))], TODAY) == 52


def test_top_habits_rank_by_completion_against_their_own_goal() -> None:
    daily = habit("Daily", *range(0, 15))  # 15 of an expected 30
    weekly = habit("Weekly", 0, 7, 14, 21, goal=1)  # 4 of an expected ~4.3
    rows = ins.top_habits([daily, weekly], TODAY)
    assert [r.name for r in rows] == ["Weekly", "Daily"]
    assert [r.completion for r in rows] == [93, 50]
    assert rows[1].streak == 15
    assert len(ins.top_habits([habit(f"H{i}", 0) for i in range(6)], TODAY)) == 3


def test_consistency_map_marks_the_month() -> None:
    a, b = habit("A", 1, 2), habit("B", 1)
    cells = dict(ins.consistency_map([a, b], TODAY))
    assert len(cells) == 31
    assert cells[date(2026, 5, 1)] == "missed"
    assert cells[ago(1)] == "completed"  # both done
    assert cells[ago(2)] == "some"  # only A
    assert cells[TODAY] == "today"
    assert cells[date(2026, 5, 14)] == "future"
    assert all(v == "future" or v == "today" for d, v in cells.items() if d >= TODAY)


# ------------------------------------------------------------------------- tasks


def test_task_bars_and_overview() -> None:
    tasks = [
        task("done early", 0, done=True, due_h=11, done_h=9),
        task("done late", 0, done=True, due_h=10, done_h=12),
        task("open", 0, due_h=8),  # overdue by NOW
        task("yesterday done", 1, done=True),
        task("ancient", 20),  # outside the week, but still overdue
    ]
    bars = ins.task_bars(tasks, TODAY, "weekly")
    assert bars[-1] == ins.Bar("Wed", 67) and bars[-2] == ins.Bar("Tue", 100)
    ov = ins.task_overview(tasks, TODAY, NOW)
    assert (ov.done, ov.total, ov.completion_rate) == (3, 4, 75)
    assert ov.on_time_rate == 67  # early and yesterday's are on time; "late" isn't
    assert ov.overdue == 2  # the open one and the ancient one


def test_time_groups_ignore_all_day_tasks() -> None:
    tasks = [
        task("m1", 1, start="08:00", done=True),
        task("m2", 1, start="11:30"),
        task("a1", 2, start="13:00", done=True),
        task("e1", 3, start="19:00"),
        task("allday", 1, start=None, done=True),
    ]
    groups = {g.name: (g.completion, g.total) for g in ins.task_time_groups(tasks, TODAY)}
    assert groups == {"Morning": (50, 2), "Afternoon": (100, 1), "Evening": (0, 1)}
    assert [g.name for g in ins.task_time_groups([], TODAY)] == ["Morning", "Afternoon", "Evening"]


def test_most_overdue_lists_oldest_first_with_days_late() -> None:
    tasks = [task("recent", 1), task("oldest", 5), task("done", 3, done=True), task("future", None)]
    rows = ins.most_overdue(tasks, TODAY, NOW)
    assert [(r.title, r.days_overdue) for r in rows] == [("oldest", 5), ("recent", 1)]
    assert len(ins.most_overdue([task(f"t{i}", i + 1) for i in range(9)], TODAY, NOW, n=5)) == 5


# ------------------------------------------------------------------ weekly report


def test_weekly_report_matches_the_mobile_demo_week() -> None:
    habits = [
        habit("Morning Workout", 0, goal=7),
        habit("Reading", 0, 1, 2, goal=5),
        habit("Drink Water", 1, 3, 4, goal=7),
        habit("Eat fruits", 2, 5, 6, goal=6),
    ]
    tasks = [
        task("a", 1),
        task("b", 0, done=True),
        task("c", 0, done=True),
        task("d", 0),
        task("e", 0),
    ]
    r = ins.weekly_report(habits, tasks, TODAY)
    assert (r.possible, r.check_ins, r.habit_rate) == (25, 10, 40)
    assert (r.tasks_total, r.tasks_done) == (5, 2)
    assert r.top_habit in {"Reading", "Drink Water", "Eat fruits"}
    assert r.needs_love == "Morning Workout"
    assert r.headline == "A quieter week. Small steps still count"
    assert len(r.tips) <= 3 and any("still need a new time" in t for t in r.tips)


def test_weekly_report_with_nothing_and_with_a_perfect_week() -> None:
    empty = ins.weekly_report([], [], TODAY)
    assert (empty.habit_rate, empty.possible, empty.best_day, empty.top_habit) == (0, 0, None, None)
    assert empty.headline == "Add a habit to get your first report"
    assert empty.tips == ["Keep going. Consistency matters more than intensity."]

    perfect = ins.weekly_report([habit("A", *range(7))], [], TODAY)
    assert perfect.habit_rate == 100 and perfect.headline.startswith("A great week")
    assert perfect.needs_love is None  # a single habit can't be "the one that needs love"
    assert perfect.best_day in ins.WEEKDAYS


# ------------------------------------------------------------------- the endpoints

import pytest  # noqa: E402
from httpx import AsyncClient  # noqa: E402

from app.models.client import FakeClient, set_client  # noqa: E402

API = "/api/v1"
Headers = dict[str, str]


async def _seed(client: AsyncClient, h: Headers) -> dict[str, str]:
    """Two habits with a few check-ins and a mix of tasks."""
    a = (
        await client.post(f"{API}/habits", json={"name": "Workout", "emoji": "💪"}, headers=h)
    ).json()
    b = (
        await client.post(f"{API}/habits", json={"name": "Read", "goal_days": 5}, headers=h)
    ).json()
    today = datetime.now(UTC).date()
    for hid, backs in ((a["id"], (0, 1, 2)), (b["id"], (0,))):
        for back in backs:
            day = (today - timedelta(days=back)).isoformat()
            await client.post(f"{API}/habits/{hid}/complete", json={"on": day}, headers=h)
    yesterday = (today - timedelta(days=1)).isoformat()
    done = (
        await client.post(f"{API}/tasks", json={"title": "Done", "start_time": "09:00"}, headers=h)
    ).json()
    await client.post(f"{API}/tasks/{done['id']}/complete", headers=h)
    await client.post(
        f"{API}/tasks", json={"title": "Late", "date": yesterday, "start_time": "08:00"}, headers=h
    )
    await client.post(f"{API}/tasks", json={"title": "Allday"}, headers=h)
    return {"workout": a["id"], "read": b["id"]}


async def test_habit_progress_endpoint(client: AsyncClient, auth_headers: Headers) -> None:
    ids = await _seed(client, auth_headers)
    weekly = (await client.get(f"{API}/analytics/habits", headers=auth_headers)).json()
    assert weekly["period"] == "weekly" and len(weekly["bars"]) == 7
    assert weekly["bars"][-1]["value"] == 100  # both habits today
    assert weekly["bars"][-2]["value"] == 50  # only the workout yesterday
    assert weekly["streak"] == 3 and weekly["best_streak"] == 3 and weekly["all_time_wins"] == 4
    assert weekly["top_habits"][0]["habit_id"] in ids.values()
    assert weekly["insight"] is None
    month_cells = weekly["consistency_map"]
    assert 28 <= len(month_cells) <= 31 and sum(c["status"] == "today" for c in month_cells) == 1

    monthly = (
        await client.get(
            f"{API}/analytics/habits", params={"period": "monthly"}, headers=auth_headers
        )
    ).json()
    assert [b["label"] for b in monthly["bars"]] == ["Wk 1", "Wk 2", "Wk 3", "Wk 4"]
    assert (
        await client.get(
            f"{API}/analytics/habits", params={"period": "daily"}, headers=auth_headers
        )
    ).status_code == 422


async def test_task_progress_endpoint(client: AsyncClient, auth_headers: Headers) -> None:
    await _seed(client, auth_headers)
    body = (await client.get(f"{API}/analytics/tasks", headers=auth_headers)).json()
    assert (body["done"], body["total"]) == (1, 3)
    assert body["completion_rate"] == 33 and body["overdue"] >= 1
    assert [g["name"] for g in body["time_groups"]] == ["Morning", "Afternoon", "Evening"]
    late = [t for t in body["most_overdue"] if t["title"] == "Late"]
    assert late and late[0]["days_overdue"] >= 1


async def test_weekly_report_endpoint(client: AsyncClient, auth_headers: Headers) -> None:
    await _seed(client, auth_headers)
    r = (await client.get(f"{API}/analytics/report/weekly", headers=auth_headers)).json()
    assert r["possible"] == 12 and r["check_ins"] == 4 and r["habit_rate"] == 33
    assert r["top_habit"] == "Workout" and r["needs_love"] == "Read"
    assert r["start"] < r["end"] and 1 <= len(r["tips"]) <= 3


async def test_progress_for_a_brand_new_user_is_all_zeros(
    client: AsyncClient, auth_headers: Headers
) -> None:
    habits = (await client.get(f"{API}/analytics/habits", headers=auth_headers)).json()
    assert habits["streak"] == 0 and habits["consistency"] == 0 and habits["top_habits"] == []
    assert {b["value"] for b in habits["bars"]} == {0}
    tasks = (await client.get(f"{API}/analytics/tasks", headers=auth_headers)).json()
    assert tasks["total"] == 0 and tasks["completion_rate"] == 0 and tasks["most_overdue"] == []
    report = (await client.get(f"{API}/analytics/report/weekly", headers=auth_headers)).json()
    assert report["headline"] == "Add a habit to get your first report"


async def test_progress_is_private_to_the_user(
    client: AsyncClient, auth_headers: Headers, other_headers: Headers
) -> None:
    await _seed(client, auth_headers)
    theirs = (await client.get(f"{API}/analytics/habits", headers=other_headers)).json()
    assert theirs["all_time_wins"] == 0 and theirs["top_habits"] == []
    assert (await client.get(f"{API}/analytics/tasks")).status_code == 401


async def test_insight_is_phrased_by_the_model_when_asked_and_survives_its_failure(
    client: AsyncClient, auth_headers: Headers
) -> None:
    await _seed(client, auth_headers)
    set_client(FakeClient(default={"content": "You're building momentum."}))
    phrased = (
        await client.get(f"{API}/analytics/habits", params={"phrase": "true"}, headers=auth_headers)
    ).json()
    assert phrased["insight"] == "You're building momentum."
    assert phrased["streak"] == 3  # the numbers are the computed ones, not the model's

    class Down(FakeClient):
        async def complete(self, *a, **k):  # type: ignore[no-untyped-def]
            from app.models.client import ModelError

            raise ModelError("down")

    set_client(Down())
    survived = await client.get(
        f"{API}/analytics/tasks", params={"phrase": "true"}, headers=auth_headers
    )
    assert survived.status_code == 200 and survived.json()["insight"] is None
    set_client(None)


@pytest.mark.parametrize("path", ["habits", "tasks", "report/weekly"])
async def test_progress_requires_auth(client: AsyncClient, path: str) -> None:
    assert (await client.get(f"{API}/analytics/{path}")).status_code == 401
