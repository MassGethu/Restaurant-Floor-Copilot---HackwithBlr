"""HTTP contract and transactional staff workflow, with an explicit fake detector."""

import time

import pytest
import supervision as sv
from fastapi.testclient import TestClient

from app.config_store import ConfigStore
from app.main import create_app
from app.schemas import OccupancySettings, TableConfig, TableDef
from conftest import FakeDetector, FakePopen, make_settings, write_video


class EmptyDetector(FakeDetector):
    def detect(self, frame):
        return sv.Detections.empty()


@pytest.fixture
def client(tmp_path):
    settings = make_settings(tmp_path, loop_video_files=False)
    video = write_video(settings.videos_dir / "floor.avi", frames=200)
    ConfigStore(settings.configs_dir).save(
        TableConfig(
            video_id="floor",
            source=str(video),
            frame_width=320,
            frame_height=180,
            tables=[
                TableDef(
                    id="T1",
                    name="Window",
                    capacity=4,
                    polygon=[(0, 0), (319, 0), (319, 179), (0, 179)],
                )
            ],
            occupancy=OccupancySettings(
                confidence_threshold=0.3, enter_seconds=1, leave_seconds=2
            ),
        )
    )
    with TestClient(
        create_app(
            settings, detector_factory=lambda _: EmptyDetector(), popen=FakePopen()
        )
    ) as http:
        yield http


def test_play_clean_queue_seat_pause_and_reset(client):
    assert (
        client.post("/api/copilot/play", json={"video_id": "floor"}).status_code == 200
    )
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        state = client.get("/api/copilot").json()
        if state["tables"][0]["observed"] == "absent":
            break
        time.sleep(0.03)
    assert state["tables"][0]["status"] == "needs_verification"
    assert client.post("/api/copilot/pause", json={"paused": True}).status_code == 200
    response = client.post("/api/copilot/tables/T1", json={"action": "clean"})
    assert response.status_code == 200
    assert response.json()["tables"][0]["status"] == "ready"
    response = client.post(
        "/api/copilot/parties", json={"name": "Test guests", "size": 4}
    )
    assert response.status_code == 201
    recommendation = response.json()["recommendations"][0]
    allocation = {k: recommendation[k] for k in ("party_id", "table_id", "version")}
    seated = client.post("/api/copilot/seat", json=allocation)
    assert seated.status_code == 200
    assert seated.json()["parties"][0]["status"] == "seated"
    assert seated.json()["tables"][0]["status"] == "occupied"
    assert client.post("/api/copilot/seat", json=allocation).status_code == 409
    reset = client.post("/api/copilot/play", json={"video_id": "floor"}).json()
    assert reset["session_id"] != seated.json()["session_id"]
    assert reset["parties"] == []
    assert reset["tables"][0]["status"] == "needs_verification"


def test_invalid_input_and_missing_video(client):
    assert (
        client.post("/api/copilot/play", json={"video_id": "missing"}).status_code
        == 404
    )
    assert client.post("/api/copilot/parties", json={"size": 0}).status_code == 422
    assert (
        client.post("/api/copilot/tables/T1", json={"action": "invented"}).status_code
        == 422
    )
    assert client.post("/api/copilot/pause", json={"paused": True}).status_code == 409


def wait_for_absence(client):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        state = client.get("/api/copilot").json()
        if (
            state["tables"]
            and state["tables"][0]["observed"] == "absent"
            and state["observations_fresh"]
        ):
            return state
        time.sleep(0.03)
    raise AssertionError("No fresh absent observation")


def test_rejected_config_edit_leaves_disk_and_seated_party_unchanged(client):
    client.post("/api/copilot/play", json={"video_id": "floor"})
    wait_for_absence(client)
    client.post("/api/copilot/pause", json={"paused": True})
    client.post("/api/copilot/tables/T1", json={"action": "clean"})
    state = client.post("/api/copilot/parties", json={"size": 4}).json()
    rec = state["recommendations"][0]
    assert (
        client.post(
            "/api/copilot/seat",
            json={k: rec[k] for k in ("party_id", "table_id", "version")},
        ).status_code
        == 200
    )
    config = client.get("/api/config").json()
    removed = client.put(
        "/api/config/tables",
        json={"tables": [], "frame_width": 320, "frame_height": 180},
    )
    assert removed.status_code == 409
    assert client.get("/api/config").json() == config
    reduced = {**config["tables"][0], "capacity": 2}
    assert (
        client.put("/api/config/tables", json={"tables": [reduced]}).status_code == 409
    )
    assert client.get("/api/config").json() == config
    assert client.get("/api/copilot").json()["parties"][0]["status"] == "seated"


def test_paused_region_edit_is_reprocessed_and_requires_verification(client):
    client.post("/api/copilot/play", json={"video_id": "floor"})
    wait_for_absence(client)
    client.post("/api/copilot/pause", json={"paused": True})
    client.post("/api/copilot/tables/T1", json={"action": "clean"})
    config = client.get("/api/config").json()
    changed = {
        **config["tables"][0],
        "polygon": [[20, 20], [280, 20], [280, 150], [20, 150]],
    }
    assert (
        client.put("/api/config/tables", json={"tables": [changed]}).status_code == 200
    )
    state = wait_for_absence(client)
    assert state["playback"]["paused"] is True
    assert state["tables"][0]["status"] == "needs_verification"
    assert (
        client.post("/api/copilot/tables/T1", json={"action": "clean"}).status_code
        == 200
    )


def test_staff_workflow_http_and_role_validation(client):
    client.post("/api/copilot/play", json={"video_id": "floor"})
    wait_for_absence(client)
    client.post("/api/copilot/pause", json={"paused": True})
    client.post("/api/copilot/tables/T1", json={"action": "hold_occupied"})
    state = client.post(
        "/api/copilot/tables/T1/service", json={"note": "Water requested"}
    ).json()
    task = next(t for t in state["tasks"] if t["kind"] == "service")
    assert (
        client.post(
            "/api/copilot/tasks/" + task["id"],
            json={"action": "assign", "staff_id": "cleaner-1"},
        ).status_code
        == 409
    )
    staff = client.post("/api/copilot/staff", json={"name": "Alex", "role": "waiter"})
    assert staff.status_code == 201
    staff_id = staff.json()["staff"][-1]["id"]
    assert (
        client.post(
            "/api/copilot/tasks/" + task["id"],
            json={"action": "assign", "staff_id": staff_id},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/copilot/tasks/" + task["id"], json={"action": "acknowledge"}
        ).status_code
        == 200
    )
    done = client.post("/api/copilot/tasks/" + task["id"], json={"action": "complete"})
    assert done.status_code == 200 and done.json()["tasks"][0]["status"] == "completed"
    assert (
        client.post(
            "/api/copilot/tasks/" + task["id"], json={"action": "complete"}
        ).status_code
        == 409
    )


def test_policy_simulation_export_and_cleaning_http(client):
    client.post("/api/copilot/play", json={"video_id": "floor"})
    wait_for_absence(client)
    client.post("/api/copilot/pause", json={"paused": True})
    client.post("/api/copilot/tables/T1", json={"action": "clean"})
    policy = client.post(
        "/api/copilot/policy",
        json={"strategy": "balanced", "max_wait_minutes": 5, "check_in_minutes": 1},
    )
    assert (
        policy.status_code == 200 and policy.json()["policy"]["strategy"] == "balanced"
    )
    party = client.post(
        "/api/copilot/parties", json={"name": "=1+1", "size": 2}
    ).json()["parties"][0]
    before = client.get("/api/copilot").json()
    result = client.post(
        "/api/copilot/simulate",
        json={"party_id": party["id"], "table_id": "T1", "delay_minutes": 2},
    )
    assert result.status_code == 200
    assert result.json()["proposed"]["min"]["total_guest_wait_minutes"] == 4
    assert client.get("/api/copilot").json()["version"] == before["version"]
    exported = client.get("/api/copilot/export")
    assert exported.status_code == 200 and "'=1+1" in exported.text
    client.post("/api/copilot/tables/T1", json={"action": "hold_occupied"})
    state = client.post("/api/copilot/tables/T1", json={"action": "depart"}).json()
    cleaning = next(t for t in state["tasks"] if t["kind"] == "cleaning")
    assert (
        client.post(
            "/api/copilot/tasks/" + cleaning["id"], json={"action": "cancel"}
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/copilot/tasks/" + cleaning["id"], json={"action": "complete"}
        ).status_code
        == 200
    )


def test_entrance_region_does_not_become_a_dining_table(client):
    client.post("/api/copilot/play", json={"video_id": "floor"})
    wait_for_absence(client)
    config = client.get("/api/config").json()
    entry = {
        "id": "ENTRY",
        "name": "Entrance",
        "kind": "entrance",
        "capacity": 1,
        "polygon": [[250, 20], [310, 20], [310, 160], [250, 160]],
    }
    saved = client.put(
        "/api/config/tables", json={"tables": config["tables"] + [entry]}
    )
    assert saved.status_code == 200
    assert len(client.get("/api/copilot").json()["tables"]) == 1
    duplicate = {**entry, "id": "ENTRY2"}
    assert (
        client.put(
            "/api/config/tables", json={"tables": config["tables"] + [entry, duplicate]}
        ).status_code
        == 422
    )


def test_staff_service_keeps_queue_clock_and_party_through_reconnect(client):
    client.post("/api/copilot/play", json={"video_id": "floor"}).raise_for_status()
    client.post("/api/stream/stop").raise_for_status()
    initial = client.post("/api/copilot/service-mode", json={"mode": "staff"}).json()
    assert initial["staff_mode"] and not initial["observations_fresh"]
    payload = {
        "name": "Walk-in",
        "size": 2,
        "session_id": initial["session_id"],
        "request_id": "lost-response",
    }
    client.post("/api/copilot/parties", json=payload).raise_for_status()
    queued = client.post("/api/copilot/parties", json=payload).json()
    assert len(queued["parties"]) == 1 and not queued["recommendations"]
    ready = client.post(
        "/api/copilot/tables/T1",
        json={"action": "clean", "table_key": queued["tables"][0]["table_key"]},
    ).json()
    rec = ready["recommendations"][0]
    payload = {k: rec[k] for k in ("party_id", "table_id", "version", "decision_key")}
    seated = client.post("/api/copilot/seat", json=payload)
    seated.raise_for_status()
    assert client.post("/api/copilot/seat", json=payload).status_code == 409
    assert (
        client.post("/api/copilot/play", json={"video_id": "floor"}).status_code == 409
    )
    reconnect = client.post("/api/copilot/reconnect")
    reconnect.raise_for_status()
    state = reconnect.json()
    assert state["session_id"] == initial["session_id"] and state["staff_mode"]
    assert state["tables"][0]["party_id"] == rec["party_id"]
    assert state["now"] > initial["now"]
    brief = client.get("/api/supervisor/handover").json()
    assert brief["mode"] == "operations" and brief["evidence"] == []
