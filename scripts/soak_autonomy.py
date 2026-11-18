"""Deterministic four-hour simulated service with invariant checks.

No camera or external provider is used; this checks the operational controller
under accumulated queue/task history, turnover, and temporary camera failures.
"""

from __future__ import annotations

import json
import random
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.autonomy import Autonomy
from app.operations import Operations
from app.schemas import TableDef


def main():
    rng = random.Random(20261118)
    report = {
        "disclosure": "Four simulated hours, synthetic observations and scripted physical task reports. No real vision or memory provider.",
        "status": "running",
    }
    with tempfile.TemporaryDirectory(prefix="autonomy-soak-") as folder:
        ops = Operations(Path(folder) / "floor.db")
        ops.configure(
            "synthetic-soak",
            [
                TableDef(
                    id=f"T{i}",
                    name=f"Soak table {i}",
                    capacity=capacity,
                    polygon=[(i * 20, 0), (i * 20 + 10, 0), (i * 20 + 10, 10)],
                )
                for i, capacity in enumerate([2, 2, 4, 4, 4, 6, 6, 8], 1)
            ],
        )
        for name, role in [
            ("Waiter 2", "waiter"),
            ("Waiter 3", "waiter"),
            ("Cleaner 2", "cleaner"),
            ("Host 1", "host"),
        ]:
            ops.add_staff(name, role)
        engine = Autonomy(ops)
        generated = 0
        peak_queue = 0
        ticks = 0
        for now in range(0, 4 * 3600, 5):
            outage = 1800 <= now < 1845 or 7200 <= now < 7260
            ops.update_camera("RECONNECTING" if outage else "LIVE", "ready", not outage)
            observations = []
            for table in ops.state["tables"]:
                party = next(
                    (p for p in ops.state["parties"] if p["id"] == table["party_id"]),
                    None,
                )
                present = bool(
                    party and 5 <= now - party["seated_at"] < 480 + (party["size"] * 20)
                )
                # Brief misses exercise the controller's continuity requirement.
                if present and now % 600 in (0, 5):
                    present = False
                observations.append(
                    SimpleNamespace(
                        table_id=table["id"],
                        status=SimpleNamespace(
                            value="OCCUPIED" if present else "AVAILABLE"
                        ),
                        people_count=party["size"] if present else 0,
                    )
                )
            ops.observe("synthetic-soak", observations, now, fresh=not outage)
            if (
                now % 30 == 0
                and sum(p["status"] == "waiting" for p in ops.state["parties"]) < 30
            ):
                ops.add_party(
                    f"Simulated party {generated}",
                    rng.choice([1, 2, 2, 3, 4, 4, 5, 6, 8]),
                )
                generated += 1
            for task in list(ops.state["tasks"]):
                if (
                    task["status"] not in ("open", "acknowledged", "in_progress")
                    or not task["assigned_to"]
                ):
                    continue
                if (
                    task["kind"] == "cleaning"
                    and not outage
                    and now - task["created_at"] >= 30
                ):
                    table = ops.table(task["table_id"])
                    if table["observed"] == "absent" and not table["party_id"]:
                        ops.update_task(task["id"], "complete")
                elif (
                    task["kind"] in ("check_in", "service")
                    and now - task["created_at"] >= 30
                ):
                    ops.update_task(task["id"], "complete")
            engine.tick()
            seated = [p for p in ops.state["parties"] if p["status"] == "seated"]
            assert len({p["table_id"] for p in seated}) == len(seated), (
                "Double allocation"
            )
            for party in seated:
                table = ops.table(party["table_id"])
                assert (
                    table["party_id"] == party["id"] and table["status"] == "occupied"
                )
                assert party["size"] <= table["capacity"], "Capacity breach"
            for task in ops.state["tasks"]:
                if (
                    task["status"] in ("open", "acknowledged", "in_progress")
                    and task["assigned_to"]
                ):
                    person = next(
                        p for p in ops.state["staff"] if p["id"] == task["assigned_to"]
                    )
                    assert person["role"] == task["role"], "Role mismatch"
            assert len(
                {e["key"] for e in ops.state["exceptions"] if e["status"] != "resolved"}
            ) == sum(e["status"] != "resolved" for e in ops.state["exceptions"]), (
                "Duplicate incident"
            )
            assert len(ops.state["automation_log"]) <= 500
            peak_queue = max(
                peak_queue, sum(p["status"] == "waiting" for p in ops.state["parties"])
            )
            ticks += 1
        report.update(
            status="pass",
            ticks=ticks,
            simulated_hours=4,
            generated_parties=generated,
            completed_dining_sessions=len(ops.state["completed_sessions"]),
            completed_staff_tasks=sum(
                t["status"] == "completed" for t in ops.state["tasks"]
            ),
            peak_queue=peak_queue,
            automatic_actions=ops.state["automation"]["actions"],
            manager_approvals=ops.state["counters"]["manager_overrides"],
            camera_outages=2,
            invariants=[
                "Unique table allocations",
                "Capacity limits",
                "Party/table consistency",
                "Staff role matching",
                "Deduplicated active exceptions",
                "Bounded decision log",
            ],
        )
        ops.close()
    output = ROOT / "docs/verification/futuretech-soak.json"
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
