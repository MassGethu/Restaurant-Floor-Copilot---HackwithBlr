"""Live-model regression for seating, alerts, cleaning, simulation and analytics.

Uses the visibly edited stock demo and explicit synthetic staff actions.
Resets this prototype's playback scenario; it does not create real customers.
"""

import json, time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
checks = []


def api(path="", body=None):
    with urlopen(
        Request(
            "http://127.0.0.1:8000/api/copilot" + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"},
        ),
        timeout=15,
    ) as response:
        return json.load(response)


def wait(predicate, timeout=100):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        state = api()
        if predicate(state):
            return state
        time.sleep(0.3)
    raise AssertionError("Expected live state was not observed")


def record(name, state):
    item = dict(
        check=name,
        scenario_time=state["now"],
        active_tasks=sum(
            t["status"] in ("open", "acknowledged", "in_progress")
            for t in state["tasks"]
        ),
        fps=state["playback"]["processing_fps"],
    )
    checks.append(item)
    print(json.dumps(item), flush=True)


try:
    api("/play", {"video_id": "controlled-floor-demo"})
    state = wait(
        lambda s: (
            s["observations_fresh"]
            and all(t["observed"] == "absent" for t in s["tables"])
        )
    )
    api("/pause", {"paused": True})
    api("/policy", dict(strategy="fairness", max_wait_minutes=15, check_in_minutes=1))
    for table in state["tables"]:
        state = api("/tables/" + table["id"], {"action": "clean"})
    pair = api("/parties", dict(name="Synthetic pair", size=2))["parties"][-1]
    api("/parties", dict(name="Synthetic four", size=4))
    before = api()
    simulation = api(
        "/simulate", dict(party_id=pair["id"], table_id="T4", horizon_minutes=120)
    )
    assert api()["version"] == before["version"]
    assert (
        simulation["proposed"]["max"]["total_guest_wait_minutes"]
        >= simulation["baseline"]["max"]["total_guest_wait_minutes"]
    )
    for _ in range(2):
        rec = api()["recommendations"][0]
        state = api(
            "/seat", {key: rec[key] for key in ("party_id", "table_id", "version")}
        )
    api("/tables/T3", {"action": "hold_occupied"})
    api("/tables/T4", {"action": "hold_occupied"})
    state = api("/parties", dict(name="Synthetic waiting pair", size=2))
    assert not state["recommendations"]
    record("Approved seating, overflow and pure what-if simulation", state)
    api("/pause", {"paused": False})
    state = wait(lambda s: s["now"] >= 32)
    assert all(
        next(t for t in state["tables"] if t["id"] == id)["observed"] == "present"
        for id in ["T1", "T2"]
    )
    record("Real YOLO observes both configured occupied regions", state)
    state = wait(lambda s: s["now"] >= 45, 25)
    assert state["tables"][0]["status"] == "occupied"
    record("Temporary absence retained occupancy", state)
    state = wait(lambda s: any(t["kind"] == "check_in" for t in s["tasks"]), 30)
    task = next(
        t for t in state["tasks"] if t["kind"] == "check_in" and t["table_id"] == "T3"
    )
    assert task["source"] == "heuristic" and "intent is unknown" in task["note"]
    api("/tasks/" + task["id"], dict(action="assign", staff_id="waiter-1"))
    api("/tasks/" + task["id"], dict(action="acknowledge"))
    state = api("/tasks/" + task["id"], dict(action="complete"))
    record(
        "Timed staff suggestion, assignment, acknowledgement and recorded visit", state
    )
    state = wait(lambda s: s["tables"][0]["status"] == "cleaning_required", 25)
    task = next(
        t
        for t in state["tasks"]
        if t["kind"] == "cleaning" and t["table_id"] == "T1" and t["status"] == "open"
    )
    api("/tasks/" + task["id"], dict(action="assign", staff_id="cleaner-1"))
    api("/tasks/" + task["id"], dict(action="start"))
    state = api("/tasks/" + task["id"], dict(action="complete"))
    rec = next(r for r in state["recommendations"] if r["table_id"] == "T1")
    state = api("/seat", {key: rec[key] for key in ("party_id", "table_id", "version")})
    api("/pause", dict(paused=True))
    assert (
        state["analytics"]["tasks_completed"] >= 2
        and state["analytics"]["guests_seated"] == 8
    )
    assert state["analytics"]["completed_sessions"] and state["availability"]
    record(
        "Cleaning task completes readiness, queue reseats and analytics update", state
    )
    result = dict(
        passed=True,
        checks=checks,
        disclosure="Actual YOLO on edited stock input. Queue entries, table holds and task actions are explicit synthetic staff inputs. Check-ins and future waits are heuristics, not inferred customer intent.",
    )
except Exception as error:
    result = dict(passed=False, checks=checks, error=repr(error))
    raise
finally:
    (ROOT / "docs/verification/expanded-live-report.json").write_text(
        json.dumps(result, indent=2)
    )
