"""Run the staged busy-shift exercise, or open a clean copy for staff practice."""

import argparse
import hashlib
import json
import os
import socket
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic, sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
VIDEO = "controlled-floor-demo"
CLIP = ROOT / "fake_camera" / "videos" / f"{VIDEO}.mp4"
CONFIG = ROOT / "backend" / "configs" / f"{VIDEO}.json"
RESTAURANT = "busy-shift-rehearsal"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


class Desk:
    def __init__(self, base, report):
        self.base = base
        self.report = report

    def request(self, path, body=None, expected=(200,)):
        request = Request(
            self.base + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=8) as response:
                code, payload = response.status, json.load(response)
        except HTTPError as error:
            code, payload = error.code, json.load(error)
        assert code in expected, (path, code, payload)
        return code, payload

    def floor(self, path="", body=None, expected=(200,)):
        return self.request("/api/copilot" + path, body, expected)[1]

    def wait(self, description, predicate, seconds=20):
        deadline = monotonic() + seconds
        state = {}
        while monotonic() < deadline:
            state = self.floor()
            if predicate(state):
                return state
            sleep(0.15)
        raise AssertionError(
            f"{description}: timed out at clip {state.get('playback', {}).get('position_seconds')}"
        )

    def record(self, check, state, **details):
        entry = dict(
            check=check,
            clip_seconds=round(state["playback"]["position_seconds"], 2),
            service_seconds=round(state["now"], 2),
            **details,
        )
        self.report["checks"].append(entry)
        print(f"[pass] {check}", flush=True)

    def table_action(self, table_id, action, expected=(200,)):
        table = row(self.floor()["tables"], table_id)
        return self.floor(
            f"/tables/{table_id}",
            {"action": action, "table_key": table["table_key"]},
            expected,
        )

    def enqueue(self, name, size, key):
        state = self.floor()
        body = {
            "name": name,
            "size": size,
            "request_id": key,
            "session_id": state["session_id"],
        }
        state = self.floor("/parties", body, (201,))
        party = next(p for p in state["parties"] if p["name"] == name)
        return party["id"], body


def row(items, key):
    return next(item for item in items if item["id"] == key)


def choice(state, party, table):
    recommendation = state["recommendations"][0]
    assert (recommendation["party_id"], recommendation["table_id"]) == (party, table)
    return {
        k: recommendation[k]
        for k in ("party_id", "table_id", "version", "decision_key")
    }


def run(desk):
    desk.floor("/play", {"video_id": VIDEO})
    desk.wait(
        "initial vacant inference",
        lambda s: (
            s["observations_fresh"]
            and all(t["observed"] == "absent" for t in s["tables"])
        ),
        45,
    )
    desk.floor("/pause", {"paused": True})
    desk.table_action("T1", "clean")
    desk.table_action("T2", "clean")
    desk.table_action("T3", "block")
    first, first_input = desk.enqueue("First pair", 2, "first-pair")
    state = desk.floor("/parties", first_input, (201,))
    assert [p["id"] for p in state["parties"]] == [first]
    rec = choice(state, first, "T1")
    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(
            workers.map(
                lambda _: desk.request("/api/copilot/seat", rec, (200, 409))[0],
                range(2),
            )
        )
    assert sorted(results) == [200, 409]
    four, _ = desk.enqueue("Party of four", 4, "party-of-four")
    desk.floor("/seat", choice(desk.floor(), four, "T2"))
    next_pair, _ = desk.enqueue("Next pair", 2, "next-pair")
    overflow, _ = desk.enqueue("Party of six", 6, "party-of-six")
    state = desk.floor("/tables/T2/service", {"note": "Rehearsal: refill water."})
    service = next(t for t in state["tasks"] if t["kind"] == "service")
    assert not state["recommendations"]
    session = state["session_id"]
    desk.record(
        "Two parties seated, two waiting; retry deduplicated and concurrent approval accepted once",
        state,
        concurrent_statuses=sorted(results),
        blocked_table="T3",
    )

    desk.floor("/pause", {"paused": False})
    for table_id in ("T1", "T2"):
        seen = desk.wait(
            f"real detection at {table_id}",
            lambda s, key=table_id: row(s["tables"], key)["observed"] == "present",
            35,
        )
        desk.record(f"YOLO presence at {table_id}", seen)
    gap = desk.wait("short absence interval", lambda s: s["now"] >= 43, 28)
    assert not row(gap["tables"], "T1")["departure_review"]
    assert row(gap["parties"], first)["status"] == "seated"
    desk.record("Two-second visual gap did not release T1", gap)
    desk.wait(
        "departure review", lambda s: row(s["tables"], "T1")["departure_review"], 38
    )
    review = desk.floor("/pause", {"paused": True})
    assert row(review["parties"], first)["status"] == "seated"
    assert not any(t["table_id"] == "T1" for t in review["tasks"])
    desk.record(
        "Sustained absence asked staff to check; party and table remained seated",
        review,
    )

    departed = desk.table_action("T1", "depart")
    cleaning = next(t for t in departed["tasks"] if t["kind"] == "cleaning")
    assert row(departed["parties"], first)["status"] == "departed"
    assert row(departed["tables"], "T1")["status"] == "cleaning_required"
    task_url = f"/tasks/{cleaning['id']}"
    desk.floor(task_url, {"action": "assign", "staff_id": "waiter-1"}, (409,))
    desk.floor(task_url, {"action": "priority_high"})
    state = desk.floor(task_url, {"action": "assign", "staff_id": "cleaner-1"})
    assert row(state["tasks"], cleaning["id"])["assigned_to"] == "cleaner-1"
    assert row(state["tasks"], cleaning["id"])["priority"] == "high"
    desk.record(
        "Staff confirmed departure, opened cleaning, set high priority and assigned a cleaner",
        state,
        wrong_role_status=409,
    )

    desk.request("/api/stream/stop", {})
    outage = desk.floor()
    assert not outage["observations_fresh"] and not outage["recommendations"]
    assert outage["session_id"] == session
    assert row(outage["tasks"], cleaning["id"])["status"] == "open"
    assert row(outage["tasks"], service["id"])["status"] == "open"
    desk.table_action("T1", "clean", (409,))
    state = desk.floor("/service-mode", {"mode": "staff"})
    desk.floor("/service-mode", {"mode": "camera"}, (409,))
    staff_started_at = state["now"]
    state = desk.wait(
        "wall-clock service", lambda s: s["now"] >= staff_started_at + 2, 6
    )
    desk.record(
        "Source stopped; camera seating suspended and staff-mode queue clock advanced",
        state,
        source_status=state["playback"]["source_status"],
        waiting_parties=2,
        open_tasks=2,
    )
    desk.floor("/play", {"video_id": VIDEO}, (409,))
    staff = desk.floor(task_url, {"action": "complete"})
    assert staff["staff_mode"] and not staff["observations_fresh"]
    assert row(staff["tasks"], cleaning["id"])["status"] == "completed"
    seated = desk.floor("/seat", choice(staff, next_pair, "T1"))
    assert row(seated["parties"], next_pair)["status"] == "seated"
    assert row(seated["parties"], overflow)["status"] == "waiting"
    desk.record(
        "Staff confirmed T1 empty and clean, then seated the next pair with camera down",
        seated,
    )

    desk.floor("/reconnect", {})
    fresh = desk.wait(
        "reconnect and fresh inference", lambda s: s["observations_fresh"], 25
    )
    assert fresh["staff_mode"] and fresh["session_id"] == session
    restored = desk.floor("/service-mode", {"mode": "camera"})
    desk.floor("/pause", {"paused": True})
    assert not restored["staff_mode"] and restored["observations_fresh"]
    assert restored["session_id"] == session and restored["now"] >= seated["now"]
    assert (
        restored["parties"] == seated["parties"]
        and restored["tasks"] == seated["tasks"]
    )
    desk.record(
        "Reconnect restored inference and preserved every party and task", restored
    )

    desk.request(
        "/api/supervisor/shifts", {"label": "Incoming rehearsal shift"}, (201,)
    )
    _, handover = desk.request("/api/supervisor/handover")
    final = desk.floor()
    assert final["session_id"] == session and final["parties"] == seated["parties"]
    assert handover["mode"] == "operations" and handover["evidence"] == []
    assert [task["id"] for task in handover["current_tasks"]] == [service["id"]]
    desk.record(
        "Incoming shift received current-work handover from SQLite",
        final,
        handover=handover["text"],
        open_task=service["note"],
    )
    desk.report["summary"] = {
        "seatings": 3,
        "confirmed_departures": 1,
        "cleaning_tasks_completed": 1,
        "waiting_at_handover": 1,
        "open_service_tasks_at_handover": 1,
        "same_operational_session_through_reconnect_and_shift_change": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manual", action="store_true", help="Open a clean practice UI"
    )
    parser.add_argument("--report", type=Path, help="Save the automated result as JSON")
    args = parser.parse_args()
    if not CLIP.is_file() or not CONFIG.is_file():
        parser.error(
            "Prepare controlled-floor-demo with scripts/prepare_demo.py first."
        )
    vite = ROOT / "frontend" / "node_modules" / ".bin" / "vite"
    if args.manual and not vite.exists():
        parser.error("Run npm ci in frontend first.")

    with CLIP.open("rb") as clip:
        clip_digest = hashlib.file_digest(clip, "sha256").hexdigest()
    report = {
        "date_utc": datetime.now(UTC).isoformat(),
        "clip": CLIP.name,
        "clip_sha256": clip_digest,
        "scope": "Staged staff actions with real YOLO inference on a synthetic stock montage.",
        "outage_injection": "Stopped the configured replay source via POST /api/stream/stop.",
        "provider_calls": 0,
        "checks": [],
    }
    try:
        with ExitStack() as resources:
            work = Path(
                resources.enter_context(
                    tempfile.TemporaryDirectory(prefix="floor-shift-")
                )
            )
            videos = work / "videos"
            videos.mkdir()
            (videos / CLIP.name).symlink_to(CLIP)
            configs = work / "configs"
            configs.mkdir()
            config = json.loads(CONFIG.read_text())
            config["source"] = str(videos / CLIP.name)
            (configs / CONFIG.name).write_text(json.dumps(config))
            api_port = free_port()
            ui_port = free_port() if args.manual else None
            base = f"http://127.0.0.1:{api_port}"
            ui = f"http://127.0.0.1:{ui_port}"
            log = resources.enter_context((work / "backend.log").open("w"))
            env = dict(
                os.environ,
                API_HOST="127.0.0.1",
                API_PORT=str(api_port),
                CORS_ORIGINS=ui,
                LOG_DIR=str(work / "logs"),
                DATA_DIR=str(work / "data"),
                CONFIGS_DIR=str(configs),
                VIDEOS_DIR=str(videos),
                DEFAULT_VIDEO_ID="",
                MANAGE_MEDIAMTX="false",
                LOOP_VIDEO_FILES="false",
                DEVICE="cpu",
                RESTAURANT_ID=RESTAURANT,
                SUPERVISOR_PROACTIVE="false",
                HINDSIGHT_LOCAL_BASE_URL="",
                HINDSIGHT_LOCAL_API_KEY="",
                HINDSIGHT_BASE_URL="",
                HINDSIGHT_API_KEY="",
                AGENT_API_KEY="",
            )
            backend = subprocess.Popen(
                [sys.executable, "-m", "app", "--memory", "local"],
                cwd=ROOT / "backend",
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            resources.callback(stop, backend)
            desk = Desk(base, report)
            try:
                deadline = monotonic() + 45
                while monotonic() < deadline and backend.poll() is None:
                    try:
                        _, supervisor = desk.request("/api/supervisor")
                        break
                    except URLError:
                        sleep(0.25)
                else:
                    raise RuntimeError("Isolated backend did not start.")
                assert supervisor["restaurant_id"] == RESTAURANT
                assert not supervisor["integration"]["memory_configured"]
                assert not supervisor["integration"]["reasoner_configured"]
                if args.manual:
                    assert ui_port != api_port
                    frontend = subprocess.Popen(
                        [
                            str(vite),
                            "--host",
                            "127.0.0.1",
                            "--port",
                            str(ui_port),
                            "--strictPort",
                            "--clearScreen",
                            "false",
                            "--open",
                            "/floor",
                        ],
                        cwd=ROOT / "frontend",
                        env=dict(os.environ, VITE_API_BASE_URL=base),
                    )
                    resources.callback(stop, frontend)
                    print(
                        f"Practice desk: {ui}/floor\n"
                        f"Simulate an outage: curl -fsS -X POST {base}/api/stream/stop\n"
                        "Ctrl+C closes the rehearsal and deletes its scratch data.",
                        flush=True,
                    )
                    return frontend.wait()
                run(desk)
                report["passed"] = True
            except Exception:
                print((work / "backend.log").read_text()[-3500:], file=sys.stderr)
                raise
    except KeyboardInterrupt:
        return 130
    except Exception as error:
        report.update(passed=False, failure=str(error))
        raise
    finally:
        if args.report and not args.manual:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("Busy-shift rehearsal passed. No Hindsight or Groq requests were made.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
