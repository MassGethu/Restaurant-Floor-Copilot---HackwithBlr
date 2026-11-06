"""Real Hindsight + real hosted model evaluation; NO fake-service fallback.

Creates an isolated synthetic operational fixture and edition-owned memory bank.
This evaluates memory behavior, not computer vision or restaurant business impact.
Run from the repo root: .venv/bin/python scripts/evaluate_memory.py
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import sys
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.memory_clients import SYSTEM, plain
from app.operations import Operations
from app.schemas import TableDef
from app.settings import get_settings
from app.supervisor import ServiceUnavailable, Supervisor, digest, utcnow


def wait_recalled(s, source_id):
    deadline = time.monotonic() + 60
    while True:
        evidence = s.evidence(
            s.memory.recall(
                "Pickup rush interruptions at T2 and the T3 alternative", s.layout()
            ),
            s.layout(),
        )
        if any(x["source_id"] == source_id for x in evidence):
            return evidence
        if time.monotonic() >= deadline:
            raise AssertionError(
                "Retained source did not become recallable within the evaluation window"
            )
        time.sleep(2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pairs", type=int, default=5, choices=range(1, 11))
    parser.add_argument(
        "--profile",
        choices=("cloud", "local"),
        help="Explicit memory target; never changes backend/.env",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Separate evidence file; defaults to a profile-specific report",
    )
    parser.add_argument(
        "--advice-interval",
        type=float,
        default=0,
        help="Minimum seconds between advice requests, for hosted-model rate limits",
    )
    args = parser.parse_args()
    if args.advice_interval < 0:
        parser.error("--advice-interval must be nonnegative")
    settings = get_settings()
    if args.profile:
        settings = settings.model_copy(update={"hindsight_profile": args.profile})
    report_path = args.output or ROOT / "docs/verification" / (
        "hindsight-local-memory-report.json"
        if settings.hindsight_profile == "local"
        else "hindsight-live-memory-report.json"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    if report_path.exists():
        previous = json.loads(report_path.read_text())
        report_path.with_name(
            f"hindsight-memory-attempt-{digest(previous)}.json"
        ).write_text(json.dumps(previous, indent=2))
    report = {
        "started_at": utcnow(),
        "passed": False,
        "status": "running",
        "pairs": [],
        "checks": {},
        "memory_profile": settings.hindsight_profile,
        "system_prompt": SYSTEM,
        "reasoning_parameters": {"temperature": 0, "strict_structured_output": True},
        "advice_interval_seconds": args.advice_interval,
        "disclosure": "Actual Hindsight and actual hosted LLM with synthetic structured floor inputs. No video inference in this evaluation. Staff outcome reports are seeded scenario data, not measured restaurant results.",
    }
    if not settings.memory_base_url or not settings.agent_api_key:
        report.update(
            status="not_run_missing_credentials",
            required=[
                "HINDSIGHT_BASE_URL",
                "HINDSIGHT_API_KEY for Cloud",
                "AGENT_API_KEY",
            ],
        )
        report_path.write_text(json.dumps(report, indent=2))
        print(
            "Live evaluation not run: configure backend/.env. No fake fallback was used."
        )
        return 2
    run_id = uuid.uuid4().hex[:10]
    settings = settings.model_copy(update={"restaurant_id": "evaluation-" + run_id})
    path = settings.data_dir / "memory-evaluations" / f"{run_id}.db"
    ops = Operations(path)
    service = None
    last_advice = 0

    def pace():
        nonlocal last_advice
        delay = args.advice_interval - (time.monotonic() - last_advice)
        while delay > 0:
            time.sleep(min(delay, 1))
            delay = args.advice_interval - (time.monotonic() - last_advice)
        last_advice = time.monotonic()

    def advice(*args_, **kwargs):
        pace()
        return service.advice(*args_, **kwargs)

    def deliver_pending():
        deadline = time.monotonic() + 300
        while any(x["delivery"] == "pending" for x in service.state["experiences"]):
            service.sync_once()
            assert not any(
                x["delivery"] == "failed" for x in service.state["experiences"]
            ), "Real retain exhausted bounded retries; inspect delivery status"
            assert time.monotonic() < deadline, (
                "Retain delivery exceeded evaluation window"
            )
            if any(x["delivery"] == "pending" for x in service.state["experiences"]):
                time.sleep(1)

    try:
        ops.configure(
            "synthetic-memory-evaluation",
            [
                TableDef(
                    id=f"T{i}",
                    name=f"Synthetic table {i}",
                    capacity=cap,
                    polygon=[(i * 20, 0), (i * 20 + 10, 0), (i * 20 + 10, 10)],
                )
                for i, cap in enumerate([2, 4, 4], 1)
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
        ops.snapshot(
            "LIVE", "ready"
        )  # Explicit synthetic observation fixture, not a detector result.
        for table in ops.state["tables"]:
            ops.action(table["id"], "clean")
        ops.add_party("Synthetic party", 4)
        service = Supervisor(ops, settings)
        report.update(
            restaurant_id=settings.restaurant_id,
            bank_id=service.memory.bank_id,
            model=settings.agent_model,
            versions={
                name: importlib.metadata.version(name)
                for name in ("hindsight-client", "groq")
            },
        )
        with service.memory.client() as client:
            report["hindsight_server"] = plain(client.get_version())
        service.set_context(
            {
                "delivery_activity": "rush",
                "staffing": "One cleaner available",
                "note": "Synthetic evaluation shift",
            }
        )
        # Past transient state deliberately differs from the current floor used in the pairs.
        ops.action("T3", "hold_occupied")
        lesson = service.capture(
            "Synthetic operational episode: during delivery rushes diners at T2 beside pickup experienced repeated interruptions. "
            "The manager chose equally fitting T3 instead. If T3 needs cleaning, prioritize its existing cleaning task and assign an available cleaner; "
            "staff must still confirm cleanliness. This preference applies only during delivery rushes, not normal service.",
            table_id="T3",
            baseline_table_id="T2",
        )
        ops.action("T3", "depart")
        ops.action("T3", "clean")
        report["checks"]["historical_state_distractor"] = (
            next(
                t for t in lesson["content"]["situation"]["tables"] if t["id"] == "T3"
            )["status"]
            == "occupied"
            and ops.table("T3")["status"] == "ready"
        )
        deliver_pending()
        service.feedback(
            lesson["id"],
            "helped",
            "Synthetic staff outcome report: staff reported fewer interruptions after using T3. No measured business improvement is claimed.",
        )
        deliver_pending()
        report["initial_recall"] = wait_recalled(service, lesson["id"])
        report["retain_receipts"] = [
            x.get("retain_receipt") for x in service.state["experiences"]
        ]
        payload, _ = service.prepare("What should we do next?")
        report["immutable_inputs"] = payload
        for i in range(args.pairs):
            result = advice(compare=True)
            actual = [
                p.get("table_id")
                for p in result["proposals"]
                if p["type"] == "seat_party"
            ]
            baseline = [
                p.get("table_id")
                for p in result["without_memory"]["proposals"]
                if p["type"] == "seat_party"
            ]
            report["pairs"].append(
                {
                    "pair": i + 1,
                    "memory_effect": actual == ["T3"] and baseline == ["T2"],
                    "result": result,
                }
            )
            print(f"Pair {i + 1}: with memory={actual}, without={baseline}", flush=True)
            report_path.write_text(json.dumps(report, indent=2))
        report["checks"]["five_pairs"] = len(report["pairs"]) == 5 and all(
            p["memory_effect"] for p in report["pairs"]
        )
        service.start_shift("Later synthetic shift")
        report["checks"]["shift_resets_temporary_context"] = (
            service.current_shift()["context"]["delivery_activity"] == "unknown"
        )
        service.set_context(
            {
                "delivery_activity": "normal",
                "staffing": "One cleaner",
                "note": "Synthetic normal service",
            }
        )
        quiet = advice()
        report["quiet_control"] = quiet
        report["checks"]["quiet_does_not_apply_rush_lesson"] = [
            p.get("table_id") for p in quiet["proposals"] if p["type"] == "seat_party"
        ] == ["T2"]
        service.close()
        ops.close()
        ops = Operations(path)
        service = Supervisor(ops, settings)
        report["checks"]["restart_does_not_restore_visual_freshness"] = not ops.fresh
        report["restart_recall"] = wait_recalled(service, lesson["id"])
        report["checks"]["persistence"] = bool(report["restart_recall"])
        # Explicitly re-establish the same synthetic floor fixture after restart.
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
        ops.snapshot("LIVE", "ready")
        service.set_context(
            {
                "delivery_activity": "rush",
                "staffing": "One cleaner available",
                "note": "Synthetic recovery scenario",
            }
        )
        ops.table("T3").update(status="cleaning_required", dirty_since=0)
        ops.save()
        recovery = advice(
            "Which existing task should we prioritize to prepare the remembered seating alternative?"
        )
        report["recovery"] = recovery
        priority = next(
            (p for p in recovery["proposals"] if p["type"] == "prioritize_task"), None
        )
        report["checks"]["recovery_priority"] = priority is not None
        if priority:
            service.approve(recovery["id"], priority["id"], True)
            assignment = advice(
                "Assign the prioritized cleaning task to an available role-matching staff member."
            )
            report["assignment"] = assignment
            assign = next(
                (p for p in assignment["proposals"] if p["type"] == "assign_task"), None
            )
            report["checks"]["recovery_assignment"] = assign is not None
            if assign:
                service.approve(assignment["id"], assign["id"], True)
        report["checks"]["no_automatic_cleanliness"] = (
            ops.table("T3")["status"] == "cleaning_required"
        )
        pace()
        report["handover"] = service.handover()
        report["checks"]["handover_evidence"] = bool(report["handover"]["evidence"])
        update = service.supersede(
            lesson["id"],
            "Synthetic environment update: pickup moved away from T2; the old rush-specific preference for T3 is obsolete. Use the current allocation policy unless new evidence warrants otherwise.",
        )
        deliver_pending()
        wait_recalled(service, update["id"])
        ops.action(
            "T3", "clean"
        )  # Explicit staff cleanliness confirmation in the synthetic fixture.
        service.set_context(
            {
                "delivery_activity": "rush",
                "staffing": "One cleaner",
                "note": "Pickup location has changed; staff-confirmed environment update is recorded.",
            }
        )
        revised = advice()
        report["supersession"] = revised
        report["checks"]["superseded_source_excluded"] = not any(
            f["source_id"] == lesson["id"] for f in revised["evidence"]
        )
        report["checks"]["superseded_guidance_revised"] = [
            p.get("table_id") for p in revised["proposals"] if p["type"] == "seat_party"
        ] == ["T2"]
        report.update(passed=all(report["checks"].values()), status="completed")
    except Exception as exc:  # noqa: BLE001 - classify service failures without exposing provider payloads
        # Do not serialize exception messages: providers may include request data.
        report.update(status="failed", error_type=type(exc).__name__)
        if isinstance(exc, ServiceUnavailable):
            report["error_detail"] = str(exc)
        if service:
            report["last_reasoning"] = service.last_reasoning
        print(
            f"Live evaluation failed ({type(exc).__name__}); partial evidence saved.",
            flush=True,
        )
    finally:
        if service:
            service.close()
        ops.close()
        report["finished_at"] = utcnow()
        report_path.write_text(json.dumps(report, indent=2))
    print(f"Report: {report_path}. Passed: {report['passed']}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
