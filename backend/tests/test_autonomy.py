"""Autonomous lifecycle, conservative evidence, concurrency, and persistence."""

import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from app.autonomy import Autonomy
from app.operations import OperationError, Operations
from app.schemas import TableDef
from app.supervisor import Supervisor
from conftest import make_settings
from test_supervisor import FakeMemory, FakeReasoner


def observation(table, status):
    return SimpleNamespace(
        table_id=table,
        status=SimpleNamespace(value=status),
        people_count=int(status == "OCCUPIED"),
    )


@pytest.fixture
def floor(tmp_path):
    ops = Operations(tmp_path / "floor.db")
    ops.configure(
        "demo",
        [
            TableDef(
                id=f"T{i}",
                name=f"Table {i}",
                capacity=size,
                polygon=[(i * 20, 0), (i * 20 + 10, 0), (i * 20 + 10, 10)],
            )
            for i, size in enumerate([2, 4, 4], 1)
        ],
    )
    ops.observe("demo", [observation(f"T{i}", "AVAILABLE") for i in range(1, 4)], 0)
    ops.update_camera("LIVE", "ready", True)
    yield ops
    ops.close()


def ready(ops):
    for table in ops.state["tables"]:
        ops.action(table["id"], "clean")


def see(ops, now, **states):
    ops.observe(
        "demo",
        [
            observation(t["id"], states.get(t["id"], "AVAILABLE"))
            for t in ops.state["tables"]
        ],
        now,
    )


def active_exceptions(ops):
    return [e for e in ops.state["exceptions"] if e["status"] != "resolved"]


def test_opening_checks_are_dispatched_not_assumed_clean(floor):
    engine = Autonomy(floor)
    engine.tick()
    assert all(t["status"] == "needs_verification" for t in floor.state["tables"])
    assert len(floor.state["tasks"]) == 3
    assert all(t["assigned_to"] == "cleaner-1" for t in floor.state["tasks"])
    engine.tick()
    assert len(floor.state["tasks"]) == 3
    assert not active_exceptions(floor)


def test_entire_lifecycle_without_manager_approval(floor):
    engine = Autonomy(floor)
    engine.tick()
    for task in list(floor.state["tasks"]):
        floor.update_task(task["id"], "complete")
    first = floor.add_party("First", 2)
    engine.tick()
    assert floor.table("T1")["party_id"] == first["id"]
    seat_task = next(t for t in floor.state["tasks"] if t["kind"] == "seating")
    assert seat_task["assigned_to"] == "waiter-1"
    assert not floor.state["parties"][0]["arrival_confirmed"]
    see(floor, 5, T1="OCCUPIED")
    engine.tick()
    assert seat_task["status"] == "completed"
    assert floor.state["parties"][0]["arrival_confirmed"]
    see(floor, 40)
    engine.tick()
    assert floor.table("T1")["status"] == "occupied"
    see(floor, 53)
    engine.tick()
    assert floor.table("T1")["status"] == "cleaning_required"
    assert floor.state["parties"][0]["status"] == "departed"
    cleaning = next(
        t
        for t in reversed(floor.state["tasks"])
        if t["kind"] == "cleaning" and t["table_id"] == "T1"
    )
    assert cleaning["assigned_to"] == "cleaner-1"
    second = floor.add_party("Second", 2)
    floor.update_task(cleaning["id"], "complete")
    engine.tick()
    assert (
        next(p for p in floor.state["parties"] if p["id"] == second["id"])["status"]
        == "seated"
    )
    assert floor.state["counters"]["manager_overrides"] == 0
    kinds = {e["kind"] for e in floor.state["automation_log"]}
    assert {"seat", "arrival_confirmed", "departure", "dispatch"} <= kinds


def test_short_absence_does_not_depart(floor):
    ready(floor)
    floor.add_party("A", 2)
    engine = Autonomy(floor)
    engine.tick()
    see(floor, 10, T1="OCCUPIED")
    engine.tick()
    see(floor, 40)
    engine.tick()
    see(floor, 45, T1="OCCUPIED")
    engine.tick()
    see(floor, 50)
    engine.tick()
    see(floor, 59)
    engine.tick()
    assert floor.table("T1")["status"] == "occupied"


def test_no_show_stays_reserved_and_escalates_once(floor):
    ready(floor)
    floor.add_party("A", 2)
    engine = Autonomy(floor)
    engine.tick()
    see(floor, 100)
    engine.tick()
    engine.tick()
    assert floor.table("T1")["status"] == "occupied"
    assert (
        len([e for e in active_exceptions(floor) if e["key"].startswith("arrival:")])
        == 1
    )
    assert not floor.state["completed_sessions"]


def test_arrival_staff_report_does_not_fabricate_vision(floor):
    ready(floor)
    floor.add_party("A", 2)
    engine = Autonomy(floor)
    engine.tick()
    task = next(t for t in floor.state["tasks"] if t["kind"] == "seating")
    floor.update_task(task["id"], "complete")
    see(floor, 100)
    engine.tick()
    assert not floor.table("T1")["seen_present"]
    assert floor.table("T1")["status"] == "occupied"
    assert not [e for e in active_exceptions(floor) if e["key"].startswith("arrival:")]


def test_camera_outage_holds_allocation_and_recovers(floor):
    ready(floor)
    floor.add_party("A", 2)
    engine = Autonomy(floor)
    floor.update_camera("RECONNECTING", "ready", False)
    engine.tick()
    engine.tick()
    assert floor.state["parties"][0]["status"] == "waiting"
    assert len(active_exceptions(floor)) == 1
    floor.update_camera("LIVE", "ready", True)
    see(floor, 1)
    engine.tick()
    assert not active_exceptions(floor)


def test_stale_table_evidence_cannot_allocate_or_depart(floor):
    ready(floor)
    floor.add_party("A", 2)
    floor.state["now"] = 20
    engine = Autonomy(floor)
    engine.tick()
    assert floor.state["parties"][0]["status"] == "waiting"
    assert len(active_exceptions(floor)) == 3


def test_pause_and_manual_mode_prevent_automatic_seating(floor):
    ready(floor)
    floor.add_party("A", 2)
    engine = Autonomy(floor)
    engine.configure({"paused": True})
    engine.tick()
    assert floor.state["parties"][0]["status"] == "waiting"
    engine.configure({"paused": False})
    floor.set_staff_mode(True)
    engine.tick()
    assert floor.state["parties"][0]["status"] == "waiting"


def test_blocked_table_and_missing_staff_are_respected(floor):
    ready(floor)
    floor.action("T1", "block")
    floor.state["staff"] = [p for p in floor.state["staff"] if p["role"] != "waiter"]
    floor.add_party("A", 2)
    engine = Autonomy(floor)
    engine.tick()
    assert floor.state["parties"][0]["status"] == "waiting"
    assert any(e["key"] == "staff:waiter" for e in active_exceptions(floor))


def test_workload_limit_queues_routine_work_without_alert_fatigue(floor):
    engine = Autonomy(floor)
    engine.configure({"max_tasks_per_staff": 1})
    engine.tick()
    assert sum(t["assigned_to"] is not None for t in floor.state["tasks"]) == 1
    assert not active_exceptions(floor)
    assigned = next(t for t in floor.state["tasks"] if t["assigned_to"])
    floor.update_task(assigned["id"], "complete")
    engine.tick()
    assert (
        sum(
            t["assigned_to"] is not None and t["status"] == "open"
            for t in floor.state["tasks"]
        )
        == 1
    )


def test_overdue_work_escalates_and_resolves_on_completion(floor):
    engine = Autonomy(floor)
    engine.tick()
    see(floor, 200)
    engine.tick()
    tasks = list(floor.state["tasks"])
    assert all(t["priority"] == "high" for t in tasks)
    assert (
        len([e for e in active_exceptions(floor) if e["key"].startswith("staff-task:")])
        == 3
    )
    for task in tasks:
        floor.update_task(task["id"], "complete")
    engine.tick()
    assert not active_exceptions(floor)


def test_manager_acknowledgement_does_not_complete_work(floor):
    engine = Autonomy(floor)
    engine.tick()
    see(floor, 200)
    engine.tick()
    incident = next(e for e in active_exceptions(floor) if e.get("task_id"))
    engine.intervene(incident["id"], "acknowledge", "Investigating")
    engine.tick()
    assert incident["status"] == "acknowledged"
    engine.intervene(incident["id"], "retry")
    engine.tick()
    assert any(e["key"] == incident["key"] for e in active_exceptions(floor))
    assert all(t["status"] == "open" for t in floor.state["tasks"])


def test_dirty_table_with_people_cannot_be_completed(floor):
    engine = Autonomy(floor)
    engine.tick()
    task = floor.state["tasks"][0]
    floor.action("T1", "hold_occupied")
    floor.action("T1", "depart")
    see(floor, 1, T1="OCCUPIED")
    engine.tick()
    assert any(e["key"] == "cleaning-conflict:T1" for e in active_exceptions(floor))
    with pytest.raises(OperationError):
        floor.update_task(task["id"], "complete")


def test_concurrent_ticks_do_not_duplicate_allocations(floor):
    ready(floor)
    floor.add_party("A", 2)
    floor.add_party("B", 4)
    engine = Autonomy(floor)
    with ThreadPoolExecutor(max_workers=4) as workers:
        list(workers.map(lambda _: engine.tick(), range(12)))
    seated = [p for p in floor.state["parties"] if p["status"] == "seated"]
    assert len(seated) == 2
    assert len({p["table_id"] for p in seated}) == 2
    assert len([e for e in floor.state["automation_log"] if e["kind"] == "seat"]) == 2


def test_restart_preserves_controls_log_tasks_and_invalidates_evidence(floor):
    engine = Autonomy(floor)
    engine.tick()
    engine.configure({"paused": True})
    path = floor.db.execute("PRAGMA database_list").fetchone()[2]
    other = Operations(__import__("pathlib").Path(path))
    try:
        assert other.state["automation"]["paused"]
        assert len(other.state["tasks"]) == 3
        assert other.state["automation_log"]
        assert not other.camera_ready
    finally:
        other.close()


def test_capacity_and_wait_exceptions_resolve_after_queue_change(floor):
    ready(floor)
    big = floor.add_party("Too large", 9)
    engine = Autonomy(floor)
    engine.tick()
    assert any(e["key"] == f"capacity:{big['id']}" for e in active_exceptions(floor))
    floor.cancel(big["id"])
    engine.tick()
    assert not active_exceptions(floor)


def test_memory_preferences_require_actual_recall_and_matching_context(floor, tmp_path):
    ready(floor)
    floor.action("T1", "block")
    floor.add_party("A", 4)
    supervisor = Supervisor(
        floor, make_settings(tmp_path), memory=FakeMemory(), reasoner=FakeReasoner()
    )
    supervisor.set_context({"delivery_activity": "rush", "staffing": "", "note": ""})
    lesson = supervisor.capture(
        "Prefer T3 during a rush", table_id="T3", baseline_table_id="T2"
    )
    supervisor.sync_once()
    engine = Autonomy(floor, supervisor=supervisor)
    rec = floor.recommendations()[0]
    assert engine._memory_choice(rec) == ("T2", None)
    supervisor.refresh_autonomy_memory()
    assert engine._memory_choice(rec)[0] == "T3"
    engine.tick()
    assert floor.state["parties"][0]["table_id"] == "T3"
    action = next(e for e in floor.state["automation_log"] if e["kind"] == "seat")
    assert action["evidence"]["source_id"] == lesson["id"]
    assert floor.state["counters"]["manager_overrides"] == 0
    supervisor.capture_automation_events()
    count = len(supervisor.state["experiences"])
    supervisor.capture_automation_events()
    assert len(supervisor.state["experiences"]) == count
    assert '"A"' not in str(supervisor.state["experiences"][-1]["content"])


def test_disputed_or_stale_memory_never_overrides(floor, tmp_path):
    ready(floor)
    floor.action("T1", "block")
    floor.add_party("A", 4)
    supervisor = Supervisor(
        floor, make_settings(tmp_path), memory=FakeMemory(), reasoner=FakeReasoner()
    )
    supervisor.set_context({"delivery_activity": "rush", "staffing": "", "note": ""})
    lesson = supervisor.capture("Prefer T3", table_id="T3", baseline_table_id="T2")
    supervisor.sync_once()
    supervisor.refresh_autonomy_memory()
    engine = Autonomy(floor, supervisor=supervisor)
    supervisor.autonomy_recalled_at = time.time() - 61
    assert engine._memory_choice(floor.recommendations()[0])[0] == "T2"
    supervisor.autonomy_recalled_at = time.time()
    supervisor.feedback(lesson["id"], "did_not_help", "Wrong preference")
    assert engine._memory_choice(floor.recommendations()[0])[0] == "T2"


def test_remembered_chairs_allocate_without_repeated_manager_check(floor, tmp_path):
    ready(floor)
    floor.add_party("Five", 5)
    supervisor = Supervisor(
        floor, make_settings(tmp_path), memory=FakeMemory(), reasoner=FakeReasoner()
    )
    supervisor.record_space("T2", 1, room=True)
    supervisor.sync_once()
    engine = Autonomy(floor, supervisor=supervisor)
    engine.tick()
    assert floor.state["parties"][0]["status"] == "waiting"
    supervisor.refresh_chair_memory()
    engine.tick()
    assert floor.state["parties"][0]["table_id"] == "T2"
    assert floor.state["parties"][0]["extra_chairs"] == 1
    assert not active_exceptions(floor)


def test_reconnect_resets_continuous_vacancy_evidence(floor):
    ready(floor)
    floor.add_party("A", 2)
    engine = Autonomy(floor)
    engine.tick()
    see(floor, 10, T1="OCCUPIED")
    engine.tick()
    see(floor, 40)
    engine.tick()
    floor.invalidate_camera()
    floor.state["now"] = 80
    floor.update_camera("LIVE", "ready", True)
    see(floor, 80)
    engine.tick()
    assert floor.table("T1")["status"] == "occupied"
    see(floor, 93)
    engine.tick()
    assert floor.table("T1")["status"] == "cleaning_required"


def test_cleaner_presence_does_not_cancel_opening_clean_check(floor):
    engine = Autonomy(floor)
    engine.tick()
    task = floor.state["tasks"][0]
    floor.update_task(task["id"], "start")
    see(floor, 3, T1="OCCUPIED")
    engine.tick()
    assert floor.table("T1")["status"] == "needs_verification"
    assert task["status"] == "in_progress"
    with pytest.raises(OperationError):
        floor.update_task(task["id"], "complete")
    see(floor, 9)
    floor.update_task(task["id"], "complete")
    assert floor.table("T1")["status"] == "ready"


def test_staff_problem_escalates_immediately_and_clears_when_resolved(floor):
    engine = Autonomy(floor)
    engine.tick()
    task = floor.state["tasks"][0]
    floor.update_task(task["id"], "report_problem", note="Cleaning supplies missing")
    engine.tick()
    assert task["priority"] == "high"
    assert any(e["key"] == f"problem:{task['id']}" for e in active_exceptions(floor))
    floor.update_task(task["id"], "resolve_problem")
    engine.tick()
    assert not active_exceptions(floor)


def test_recalled_preferences_wait_bounded_time_then_fall_back(
    floor, tmp_path, monkeypatch
):
    ready(floor)
    floor.action("T1", "block")
    floor.add_party("A", 4)
    supervisor = Supervisor(
        floor, make_settings(tmp_path), memory=FakeMemory(), reasoner=FakeReasoner()
    )
    supervisor.set_context({"delivery_activity": "rush", "staffing": "", "note": ""})
    supervisor.capture("Prefer T3", table_id="T3", baseline_table_id="T2")
    supervisor.sync_once()
    engine = Autonomy(floor, supervisor=supervisor)
    clock = [100.0]
    monkeypatch.setattr("app.autonomy.time.monotonic", lambda: clock[0])
    engine.tick()
    assert floor.state["parties"][0]["status"] == "waiting"
    clock[0] += 9
    engine.tick()
    assert floor.state["parties"][0]["table_id"] == "T2"


def test_unacknowledged_job_moves_to_another_staff_member(floor):
    floor.add_staff("Second cleaner", "cleaner")
    engine = Autonomy(floor)
    engine.tick()
    task = floor.state["tasks"][0]
    old = task["assigned_to"]
    see(floor, 46)
    engine.tick()
    assert task["assigned_to"] and task["assigned_to"] != old
    assert not active_exceptions(floor)
    assert old in task["attempted_staff"]


def test_unavailable_staff_handoff_and_stale_worker_rejected(floor):
    floor.add_staff("Second cleaner", "cleaner")
    engine = Autonomy(floor)
    engine.tick()
    task = floor.state["tasks"][0]
    old, revision = task["assigned_to"], task["assignment_revision"]
    floor.set_staff_availability(old, False)
    engine.tick()
    assert task["assigned_to"] != old and task["assigned_to"]
    with pytest.raises(OperationError, match="reassigned"):
        floor.update_task(
            task["id"], "complete", assignment_revision=revision, assigned_staff_id=old
        )
    assert not active_exceptions(floor)


def test_exhausted_staff_alerts_once_and_returning_staff_recovers(floor):
    engine = Autonomy(floor)
    engine.tick()
    see(floor, 46)
    engine.tick()
    assert all(t["assigned_to"] is None for t in floor.state["tasks"])
    incidents = len(active_exceptions(floor))
    engine.tick()
    assert len(active_exceptions(floor)) == incidents == 3
    floor.set_staff_availability("cleaner-1", True)
    engine.tick()
    assert all(t["assigned_to"] == "cleaner-1" for t in floor.state["tasks"])
    assert not active_exceptions(floor)


def test_acknowledged_work_is_not_reassigned_or_escalated_for_age_alone(floor):
    engine = Autonomy(floor)
    engine.tick()
    for task in floor.state["tasks"]:
        floor.update_task(task["id"], "start")
    see(floor, 200)
    engine.tick()
    assert all(t["assigned_to"] == "cleaner-1" for t in floor.state["tasks"])
    assert not active_exceptions(floor)
