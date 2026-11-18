"""Real Hindsight retention/recall -> autonomous allocation, on synthetic floor data.

Uses an isolated memory bank. No test doubles, hosted reasoning or video input.
Credentials are loaded normally and never written into the report.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.autonomy import Autonomy
from app.operations import Operations
from app.schemas import TableDef
from app.settings import get_settings
from app.supervisor import Supervisor, utcnow


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT / "docs/verification/futuretech-live-memory.json",
    )
    args = parser.parse_args()
    settings = get_settings().model_copy(
        update={"restaurant_id": "autonomy-verification-" + uuid.uuid4().hex[:10]}
    )
    report = {
        "started_at": utcnow(),
        "status": "running",
        "memory_profile": settings.hindsight_profile,
        "disclosure": "Real Hindsight retention and recall with synthetic structured floor inputs. No video, fake memory, or hosted reasoning. No restaurant business-impact claim.",
        "checks": [],
    }
    with tempfile.TemporaryDirectory(prefix="autonomy-memory-") as folder:
        ops = Operations(Path(folder) / "floor.db")
        supervisor = None
        try:
            ops.configure(
                "synthetic-autonomy-memory",
                [
                    TableDef(
                        id=f"T{i}",
                        name=f"Synthetic table {i}",
                        capacity=size,
                        polygon=[(i * 20, 0), (i * 20 + 10, 0), (i * 20 + 10, 10)],
                    )
                    for i, size in enumerate([2, 4, 4], 1)
                ],
            )
            ops.observe(
                ops.state["video_id"],
                [
                    SimpleNamespace(
                        table_id=f"T{i}",
                        status=SimpleNamespace(value="AVAILABLE"),
                        people_count=0,
                    )
                    for i in range(1, 4)
                ],
                0,
            )
            ops.update_camera("LIVE", "ready", True)
            for table in ops.state["tables"]:
                ops.action(table["id"], "clean")
            ops.add_party("Synthetic party", 4)
            supervisor = Supervisor(ops, settings)
            supervisor.set_context(
                {
                    "delivery_activity": "rush",
                    "staffing": "",
                    "note": "Synthetic verification conditions",
                }
            )
            lesson = supervisor.capture(
                "Synthetic verification: pickup traffic repeatedly interrupted T2 during a delivery rush. Prefer T3 for a four-person party when both are eligible.",
                table_id="T3",
                baseline_table_id="T2",
            )
            report["bank_id"] = supervisor.memory.bank_id
            report["source_id"] = lesson["id"]
            deadline = time.monotonic() + 120
            while supervisor.record(lesson["id"])["delivery"] != "retained":
                supervisor.sync_once()
                if (
                    supervisor.record(lesson["id"])["delivery"] == "failed"
                    or time.monotonic() >= deadline
                ):
                    raise RuntimeError("Real Hindsight retention did not complete.")
                if supervisor.record(lesson["id"])["delivery"] != "retained":
                    time.sleep(1)
            report["checks"].append("Correction retained by real Hindsight")
            print("[pass] Correction retained by real Hindsight", flush=True)
            deadline = time.monotonic() + 90
            while True:
                # Accelerate the retry interval for this isolated verification;
                # every fact still comes through the production recall adapter.
                supervisor.autonomy_recalled_at = 0
                supervisor.refresh_autonomy_memory()
                if any(
                    f["source_id"] == lesson["id"] for f in supervisor.autonomy_evidence
                ):
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError(
                        "Retained correction was not returned by real Hindsight recall."
                    )
                time.sleep(2)
            report["checks"].append(
                "Real recall returned an active matching preference"
            )
            engine = Autonomy(ops, supervisor=supervisor)
            baseline = ops.recommendations()[0]["table_id"]
            engine.tick()
            selected = ops.state["parties"][0]["table_id"]
            assert baseline == "T2" and selected == "T3", (baseline, selected)
            event = next(e for e in ops.state["automation_log"] if e["kind"] == "seat")
            assert (
                event["evidence"]["source_id"] == lesson["id"]
                and event["evidence"]["fact_id"]
            )
            report["checks"].append(
                "Controller selected T3 instead of baseline T2 and cited the real recalled fact"
            )
            print(
                "[pass] Autonomous allocation used real recalled evidence", flush=True
            )
            supervisor.feedback(
                lesson["id"],
                "did_not_help",
                "Synthetic invalidation check; retire this preference",
            )
            ops.add_party("Synthetic second party", 4)
            engine.tick()
            assert ops.state["parties"][1]["table_id"] == "T2"
            report["checks"].append(
                "A disputed correction stopped influencing the next allocation"
            )
            report.update(
                status="pass",
                baseline_table=baseline,
                selected_table=selected,
                evidence=event["evidence"],
                manager_approvals=0,
                finished_at=utcnow(),
            )
        except Exception as error:
            report.update(
                status="failed", error_type=type(error).__name__, finished_at=utcnow()
            )
            raise
        finally:
            if supervisor:
                supervisor.close()
            ops.close()
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Saved {args.report}", flush=True)


if __name__ == "__main__":
    main()
