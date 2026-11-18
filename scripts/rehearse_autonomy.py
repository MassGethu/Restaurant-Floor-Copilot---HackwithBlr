"""Exercise autonomous service with real YOLO inference and staged staff inputs.

Starts an isolated server/database. Does not modify the user's existing floor,
and does not claim that scripted staff reports are observed physical cleaning.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
VIDEO = "controlled-floor-demo"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT / "docs/verification/futuretech-autonomy-rehearsal.json",
    )
    args = parser.parse_args()
    if not (ROOT / "fake_camera/videos" / f"{VIDEO}.mp4").exists():
        raise SystemExit(
            "Prepare the controlled footage with scripts/prepare_demo.py first."
        )
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    report = {
        "verification": "Real YOLO on a labelled stock montage; staff actions are staged API inputs.",
        "checks": [],
    }
    with tempfile.TemporaryDirectory(prefix="futuretech-autonomy-") as folder:
        work = Path(folder)
        configs = work / "configs"
        configs.mkdir()
        config = json.loads((ROOT / "backend/configs" / f"{VIDEO}.json").read_text())
        config["tables"] = config["tables"][:2]
        config["source"] = str(ROOT / "fake_camera/videos" / f"{VIDEO}.mp4")
        (configs / f"{VIDEO}.json").write_text(json.dumps(config))
        env = {
            **os.environ,
            "API_PORT": str(port),
            "DATA_DIR": str(work / "data"),
            "CONFIGS_DIR": str(configs),
            "LOG_DIR": str(work / "logs"),
            "DEFAULT_VIDEO_ID": VIDEO,
            "RESTAURANT_ID": "futuretech-rehearsal",
            "MANAGE_MEDIAMTX": "false",
            "HINDSIGHT_PROFILE": "cloud",
            "HINDSIGHT_BASE_URL": "",
            "AGENT_API_KEY": "",
            "AUTONOMY_WORKER_ENABLED": "true",
        }
        with (work / "server.log").open("w") as logs:
            process = subprocess.Popen(
                [sys.executable, "-m", "app"],
                cwd=ROOT / "backend",
                env=env,
                stdout=logs,
                stderr=subprocess.STDOUT,
            )
            base = f"http://127.0.0.1:{port}/api/copilot"

            def request(path="", body=None):
                req = Request(
                    base + path,
                    data=None if body is None else json.dumps(body).encode(),
                    headers={"Content-Type": "application/json"},
                )
                with urlopen(req, timeout=10) as response:
                    return json.load(response)

            def wait(label, predicate, seconds=30):
                deadline = time.monotonic() + seconds
                while time.monotonic() < deadline:
                    try:
                        state = request()
                        if predicate(state):
                            report["checks"].append(
                                {
                                    "check": label,
                                    "clip_seconds": round(state["now"], 2),
                                    "status": "pass",
                                }
                            )
                            print(f"[pass] {label}", flush=True)
                            return state
                    except (HTTPError, URLError):
                        if process.poll() is not None:
                            raise RuntimeError(
                                "Rehearsal server exited. "
                                + (work / "server.log").read_text()[-2000:]
                            )
                    time.sleep(0.15)
                raise AssertionError(f"Timed out: {label}")

            def checkin(name, size, token):
                door = request("/check-in")
                return request(
                    "/check-in",
                    {
                        "name": name,
                        "size": size,
                        "request_id": token,
                        "session_id": door["session_id"],
                    },
                )

            try:
                wait(
                    "Real inference sees initial empty tables",
                    lambda s: (
                        s["observations_fresh"]
                        and all(t["observed"] == "absent" for t in s["tables"])
                    ),
                    40,
                )
                request("/pause", {"paused": True})
                state = wait(
                    "Opening checks automatically assigned",
                    lambda s: (
                        len(s["tasks"]) == 2
                        and all(t["assigned_to"] for t in s["tasks"])
                    ),
                )
                for task in state["tasks"]:
                    request(f"/tasks/{task['id']}", {"action": "complete"})
                checkin("Demo pair", 2, "demo-pair")
                checkin("Demo four", 4, "demo-four")
                checkin("Demo next pair", 2, "demo-next")
                checkin("Demo large party", 9, "demo-large")
                state = wait(
                    "Two parties automatically allocated without approvals",
                    lambda s: sum(p["status"] == "seated" for p in s["parties"]) == 2,
                )
                assert state["analytics"]["manual_overrides"] == 0
                wait(
                    "Oversized party escalated as an exception",
                    lambda s: any(
                        e["key"].startswith("capacity:") and e["status"] == "open"
                        for e in s["exceptions"]
                    ),
                )
                request("/pause", {"paused": False})
                wait(
                    "Real vision confirms both arrivals",
                    lambda s: all(t["seen_present"] for t in s["tables"]),
                    40,
                )
                state = wait(
                    "Short vacancy does not depart the first party",
                    lambda s: s["now"] >= 44 and s["tables"][0]["status"] == "occupied",
                    35,
                )
                wait(
                    "Sustained vacancy automatically closes departure",
                    lambda s: s["tables"][0]["status"] == "cleaning_required",
                    55,
                )
                request("/pause", {"paused": True})
                state = wait(
                    "Turnover cleaning automatically dispatched",
                    lambda s: any(
                        t["kind"] == "cleaning"
                        and t["status"] == "open"
                        and t["assigned_to"]
                        for t in s["tasks"]
                    ),
                )
                task = next(
                    t
                    for t in state["tasks"]
                    if t["kind"] == "cleaning" and t["status"] == "open"
                )
                request(f"/tasks/{task['id']}", {"action": "complete"})
                state = wait(
                    "Cleaner completion automatically seats the next party",
                    lambda s: (
                        next(p for p in s["parties"] if p["name"] == "Demo next pair")[
                            "status"
                        ]
                        == "seated"
                    ),
                )
                assert state["analytics"]["manual_overrides"] == 0
                report.update(
                    status="pass",
                    manager_approvals=0,
                    staff_inputs="Two opening-clean reports and one turnover-clean report; no seating or departure approval calls.",
                    automatic_actions=state["automation"]["actions"],
                    action_log=state["automation_log"],
                    active_exceptions=[
                        e for e in state["exceptions"] if e["status"] != "resolved"
                    ],
                    completed_sessions=state["completed_sessions"],
                )
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps(report, indent=2))
                print(f"Saved {args.report}", flush=True)
            finally:
                process.terminate()
                try:
                    process.wait(8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
