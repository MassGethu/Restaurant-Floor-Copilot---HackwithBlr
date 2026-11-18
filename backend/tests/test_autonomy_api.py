"""New HTTP boundaries and background worker integration."""

# ruff: noqa: F811
import time

from app.config_store import ConfigStore
from app.main import create_app
from app.schemas import OccupancySettings, TableConfig, TableDef
from conftest import FakePopen, make_settings, write_video
from fastapi.testclient import TestClient
from test_copilot_api import (
    EmptyDetector,
    client,  # noqa: F401
)


def start(client):
    client.post("/api/copilot/play", json={"video_id": "floor"})
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        state = client.get("/api/copilot").json()
        if state["tables"][0]["observed"] == "absent":
            break
        time.sleep(0.02)
    client.post("/api/copilot/pause", json={"paused": True})
    return client.get("/api/copilot/check-in").json()


def test_guest_self_check_in_is_idempotent_and_private(client):
    door = start(client)
    assert set(door) == {"session_id", "accepting", "waiting", "max_party_size"}
    body = {
        "name": "Guest A",
        "size": 2,
        "request_id": "guest-secret-token-123",
        "session_id": door["session_id"],
    }
    first = client.post("/api/copilot/check-in", json=body)
    again = client.post("/api/copilot/check-in", json=body)
    assert first.status_code == again.status_code == 201
    assert first.json() == again.json()
    state = client.get("/api/copilot").json()
    assert len(state["parties"]) == 1
    ticket = client.get("/api/copilot/check-in/guest-secret-token-123").json()
    assert ticket["name"] == "Guest A"
    assert (
        "parties" not in ticket and "staff" not in ticket and "exceptions" not in ticket
    )
    assert client.get("/api/copilot/check-in/unknown").status_code == 404
    assert (
        client.post("/api/copilot/check-in", json={**body, "size": 3}).status_code
        == 409
    )


def test_guest_check_in_rejects_missing_or_expired_session(client):
    door = start(client)
    assert (
        client.post("/api/copilot/check-in", json={"name": "A", "size": 2}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/copilot/check-in",
            json={"name": "A", "size": 2, "request_id": "token", "session_id": "old"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/copilot/check-in",
            json={
                "name": "A",
                "size": 0,
                "request_id": "token",
                "session_id": door["session_id"],
            },
        ).status_code
        == 422
    )


def test_settings_controls_and_limits(client):
    start(client)
    response = client.post(
        "/api/copilot/automation", json={"paused": True, "departure_seconds": 20}
    )
    assert response.status_code == 200
    assert response.json()["automation"]["paused"]
    assert response.json()["automation"]["departure_seconds"] == 20
    assert (
        client.post(
            "/api/copilot/automation", json={"departure_seconds": 0}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/copilot/automation", json={"max_tasks_per_staff": 11}
        ).status_code
        == 422
    )
    client.post("/api/copilot/automation", json={"paused": False})
    assert not client.get("/api/copilot").json()["automation"]["paused"]


def test_http_guest_to_cleaner_to_automatic_allocation(client):
    door = start(client)
    app = client.app.state
    app.autonomy.tick()
    state = client.get("/api/copilot").json()
    task = state["tasks"][0]
    assert task["assigned_to"] == "cleaner-1"
    body = {
        "name": "Self check-in",
        "size": 2,
        "request_id": "live-ticket",
        "session_id": door["session_id"],
    }
    client.post("/api/copilot/check-in", json=body)
    assert (
        client.post(
            f"/api/copilot/tasks/{task['id']}", json={"action": "complete"}
        ).status_code
        == 200
    )
    app.autonomy.tick()
    ticket = client.get("/api/copilot/check-in/live-ticket").json()
    assert ticket["status"] == "seated"
    assert ticket["table_name"] == "Window"
    state = client.get("/api/copilot").json()
    assert len([e for e in state["automation_log"] if e["kind"] == "seat"]) == 1
    assert state["analytics"]["manual_overrides"] == 0


def test_exception_acknowledge_and_recheck_contract(client):
    start(client)
    client.app.state.operations.update_camera("RECONNECTING", "ready", False)
    # No pipeline refresh in this direct test, to retain the staged outage.
    engine = client.app.state.autonomy
    refresh = engine.refresh
    engine.refresh = None
    try:
        engine.tick()
        item = next(
            e
            for e in client.app.state.operations.state["exceptions"]
            if e["status"] == "open"
        )
        response = client.post(
            f"/api/copilot/exceptions/{item['id']}",
            json={"action": "acknowledge", "note": "Checking camera"},
        )
        assert response.status_code == 200
        assert response.json()["exceptions"][0]["status"] == "acknowledged"
        assert (
            client.post(
                "/api/copilot/exceptions/missing", json={"action": "retry"}
            ).status_code
            == 409
        )
        assert (
            client.post(
                f"/api/copilot/exceptions/{item['id']}", json={"action": "invented"}
            ).status_code
            == 422
        )
    finally:
        engine.refresh = refresh


def test_worker_operates_without_browser_or_snapshot_requests(tmp_path):
    settings = make_settings(
        tmp_path, default_video_id="worker", autonomy_worker_enabled=True
    )
    video = write_video(settings.videos_dir / "worker.avi", frames=200)
    ConfigStore(settings.configs_dir).save(
        TableConfig(
            video_id="worker",
            source=str(video),
            frame_width=320,
            frame_height=180,
            tables=[
                TableDef(
                    id="T1",
                    name="Worker table",
                    capacity=4,
                    polygon=[(0, 0), (319, 0), (319, 179), (0, 179)],
                )
            ],
            occupancy=OccupancySettings(
                confidence_threshold=0.3, enter_seconds=0, leave_seconds=0
            ),
        )
    )
    with TestClient(
        create_app(
            settings, detector_factory=lambda _: EmptyDetector(), popen=FakePopen()
        )
    ) as http:
        ops = http.app.state.operations
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline:
            with ops.lock:
                tasks = [dict(t) for t in ops.state["tasks"]]
            if tasks and tasks[0]["assigned_to"]:
                break
            time.sleep(0.02)
        assert tasks and tasks[0]["assigned_to"] == "cleaner-1"
        ops.update_task(tasks[0]["id"], "complete")
        ops.add_party("No browser", 2)
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            with ops.lock:
                seated = ops.state["parties"][0]["status"] == "seated"
            if seated:
                break
            time.sleep(0.02)
        assert seated
        assert ops.state["counters"]["manager_overrides"] == 0


def test_manager_space_exception_dispatches_guidance_without_stopping_loop(client):
    start(client)
    app = client.app.state
    app.autonomy.start()
    try:
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if app.operations.state["tasks"]:
                break
            time.sleep(0.02)
        task = app.operations.state["tasks"][0]
        client.post(f"/api/copilot/tasks/{task['id']}", json={"action": "complete"})
        response = client.post(
            "/api/copilot/parties", json={"name": "Five guests", "size": 5}
        )
        party = response.json()["parties"][0]
        state = client.get("/api/copilot").json()
        response = client.post(
            "/api/copilot/seat",
            json={
                "party_id": party["id"],
                "table_id": "T1",
                "version": state["version"],
                "extra_chairs": 1,
                "room_checked": True,
            },
        )
        assert response.status_code == 200, response.json()
        assert (
            response.json()["automation"]["enabled"]
            and not response.json()["automation"]["paused"]
        )
        guidance = next(t for t in response.json()["tasks"] if t["kind"] == "seating")
        assert guidance["party_id"] == party["id"]
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            row = next(
                t for t in app.operations.state["tasks"] if t["id"] == guidance["id"]
            )
            if row["assigned_to"]:
                break
            time.sleep(0.02)
        assert row["assigned_to"] == "waiter-1"
    finally:
        app.autonomy.close()


def test_staff_availability_and_assignment_version_contract(client):
    start(client)
    app = client.app.state
    app.autonomy.tick()
    task = app.operations.state["tasks"][0].copy()
    response = client.post(
        "/api/copilot/staff/cleaner-1/availability", json={"available": False}
    )
    assert response.status_code == 200
    assert response.json()["staff"][1]["available"] is False
    assert (
        next(t for t in response.json()["tasks"] if t["id"] == task["id"])[
            "assigned_to"
        ]
        is None
    )
    stale = client.post(
        "/api/copilot/tasks/" + task["id"],
        json={
            "action": "complete",
            "assignment_revision": task["assignment_revision"],
            "assigned_staff_id": "cleaner-1",
        },
    )
    assert stale.status_code == 409
    response = client.post(
        "/api/copilot/staff/cleaner-1/availability", json={"available": True}
    )
    assert (
        next(t for t in response.json()["tasks"] if t["id"] == task["id"])[
            "assigned_to"
        ]
        == "cleaner-1"
    )
    assert (
        client.post(
            "/api/copilot/staff/missing/availability", json={"available": False}
        ).status_code
        == 409
    )
    assert set(client.get("/api/copilot/network").json()) == {"lan_address"}
