"""Local control loop: observe, act, dispatch, verify, and escalate.

No provider request runs here. A slow memory service cannot stop floor service.
Every action is revalidated while holding the same lock as staff interventions.
"""

from __future__ import annotations

import copy
import threading
import time
import uuid

ACTIVE = ("open", "acknowledged", "in_progress")


class Autonomy:
    def __init__(self, operations, refresh=None, supervisor=None):
        self.ops, self.refresh, self.supervisor = operations, refresh, supervisor
        self.stopping = threading.Event()
        self.worker = None
        self.memory_waits = {}

    def _await_memory(self, recommendation):
        """Give relevant recall up to eight seconds without blocking the worker.

        The ledger only tells us a recall is worth waiting for. It never supplies
        the actual evidence used to change an allocation.
        """
        s = self.supervisor
        if s is None or not s.memory_configured:
            return False
        scopes = s.applicable_preferences(s.layout())
        relevant = any(
            scope["baseline_table_id"] == recommendation["table_id"]
            for scope in scopes.values()
        )
        if not relevant:
            return False
        if time.time() - s.autonomy_recalled_at <= 60 and s.autonomy_evidence:
            return False
        key = (
            self.ops.state["session_id"],
            recommendation["party_id"],
            s.current_shift()["id"],
        )
        started = self.memory_waits.setdefault(key, time.monotonic())
        return time.monotonic() - started < 8

    def configure(self, values):
        with self.ops.lock:
            self.ops.state["automation"].update(values)
            self.ops.record_automation(
                "control", "Automation settings updated.", settings=values
            )
            self.ops.save()

    def intervene(self, exception_id, action, note=""):
        with self.ops.lock:
            item = next(
                (e for e in self.ops.state["exceptions"] if e["id"] == exception_id),
                None,
            )
            if not item or item["status"] not in ("open", "acknowledged"):
                self.ops.fail("This exception is already closed or no longer exists.")
            if action == "acknowledge":
                item["status"] = "acknowledged"
            elif action == "retry":
                item["rechecked_at"] = self.ops.state["now"]
            else:
                self.ops.fail("Unknown exception action.")
            item["manager_note"] = note.strip()[:240]
            self.ops.record_automation(
                "intervention",
                f"Manager {action}: {item['title']}",
                exception_id=exception_id,
            )
            self.ops.state["counters"]["manager_overrides"] += 1
            self.ops.save()
        if action == "retry":
            self.tick()

    def _exception(self, seen, key, title, detail, severity="warning", **target):
        seen.add(key)
        old = next(
            (
                e
                for e in self.ops.state["exceptions"]
                if e["key"] == key and e["status"] in ("open", "acknowledged")
            ),
            None,
        )
        if old:
            old.update(detail=detail, **target)
            return
        self.ops.state["exceptions"].insert(
            0,
            dict(
                id=str(uuid.uuid4()),
                key=key,
                title=title,
                detail=detail,
                severity=severity,
                status="open",
                created_at=self.ops.state["now"],
                resolved_at=None,
                **target,
            ),
        )
        self.ops.record_automation("escalation", title, exception_key=key)

    def _dispatch(self, seen):
        ops = self.ops
        active = [t for t in ops.state["tasks"] if t["status"] in ACTIVE]
        loads = {
            p["id"]: sum(t["assigned_to"] == p["id"] for t in active)
            for p in ops.state["staff"]
        }
        limit = ops.state["automation"]["max_tasks_per_staff"]
        for task in sorted(
            active,
            key=lambda t: (t.get("priority") != "high", t["created_at"], t["id"]),
        ):
            if task.get("problem"):
                self._exception(
                    seen,
                    f"problem:{task['id']}",
                    "Staff reported a problem",
                    f"{ops.table(task['table_id'])['name']}: {task['problem']}",
                    task_id=task["id"],
                    table_id=task["table_id"],
                )
            roster = {p["id"]: p for p in ops.state["staff"]}
            owner = roster.get(task["assigned_to"])
            ack_limit = ops.state["automation"].get(
                "acknowledgement_timeout_seconds", 45
            )
            expired = (
                task["status"] == "open"
                and task["assigned_to"]
                and ops.state["now"] - task.get("assigned_at", task["created_at"])
                >= ack_limit
            )
            unavailable = task["assigned_to"] and (
                not owner or not owner.get("available", True)
            )
            if expired or unavailable:
                previous = task["assigned_to"]
                task.setdefault("attempted_staff", [])
                if previous not in task["attempted_staff"]:
                    task["attempted_staff"].append(previous)
                if previous in loads:
                    loads[previous] -= 1
                task.update(
                    assigned_to=None,
                    status="open",
                    acknowledged_at=None,
                    reassignment_reason="Staff unavailable"
                    if unavailable
                    else "Acknowledgement timed out",
                )
                ops.record_automation(
                    "reassignment",
                    task["reassignment_reason"] + "; finding another team member.",
                    task_id=task["id"],
                    previous_staff_id=previous,
                )
            if not task["assigned_to"]:
                eligible = [
                    p
                    for p in ops.state["staff"]
                    if p["role"] == task["role"]
                    and p.get("available", True)
                    and loads[p["id"]] < limit
                    and p["id"] not in task.get("attempted_staff", [])
                ]
                if eligible:
                    person = min(eligible, key=lambda p: (loads[p["id"]], p["id"]))
                    task.update(
                        assigned_to=person["id"],
                        assigned_at=ops.state["now"],
                        assignment_origin="automation",
                        assignment_revision=task.get("assignment_revision", 0) + 1,
                    )
                    loads[person["id"]] += 1
                    ops.record_automation(
                        "dispatch",
                        f"Assigned {task['kind'].replace('_', ' ')} to {person['name']}.",
                        task_id=task["id"],
                        table_id=task["table_id"],
                    )
                elif (
                    task.get("attempted_staff")
                    or ops.state["now"] - task["created_at"]
                    >= ops.state["automation"]["task_timeout_seconds"]
                    or not any(
                        p["role"] == task["role"] and p.get("available", True)
                        for p in ops.state["staff"]
                    )
                ):
                    self._exception(
                        seen,
                        f"staff-task:{task['id']}",
                        "Nobody can take this job",
                        f"{ops.table(task['table_id'])['name']}: no available, untried {task['role']} has capacity. Work remains queued.",
                        task_id=task["id"],
                        table_id=task["table_id"],
                    )
            if (
                ops.state["now"] - task["created_at"]
                >= ops.state["automation"]["task_timeout_seconds"]
                and task.get("priority") != "high"
            ):
                task["priority"] = "high"
                ops.record_automation(
                    "priority",
                    "Overdue work raised to high priority.",
                    task_id=task["id"],
                )

    def _memory_choice(self, recommendation):
        """Only genuinely recalled, still-active corrections may change allocation."""
        supervisor = self.supervisor
        if supervisor is None or time.time() - supervisor.autonomy_recalled_at > 60:
            return recommendation["table_id"], None
        scopes = supervisor.applicable_preferences(supervisor.layout())
        candidates = supervisor.candidates()
        # Recalled evidence is populated by the memory worker, never by the ledger.
        for fact in getattr(supervisor, "autonomy_evidence", []):
            scope = scopes.get(fact["source_id"])
            for choice in candidates:
                if (
                    choice["type"] == "seat_party"
                    and choice["party_id"] == recommendation["party_id"]
                    and self.ops.state["now"]
                    - self.ops.table(choice["table_id"]).get("observed_at", -10000)
                    <= 5
                    and supervisor.preference_matches(scope, choice, candidates)
                ):
                    return choice["table_id"], {
                        "source_id": fact["source_id"],
                        "fact_id": fact["id"],
                        "reason": "Matching correction recalled from Hindsight.",
                    }
        return recommendation["table_id"], None

    def tick(self):
        # Refresh before acquiring the operations lock: pipeline uses pipeline -> floor order.
        if self.refresh:
            self.refresh()
        ops = self.ops
        with ops.lock:
            ops.advance_clock()
            config = ops.state["automation"]
            if not config["enabled"] or config["paused"]:
                return
            before = copy.deepcopy(
                (ops.state["tables"], ops.state["tasks"], ops.state["exceptions"])
            )
            seen = set()
            now = ops.state["now"]
            config.update(last_tick_at=time.time(), last_error=None)
            if not ops.state["tables"]:
                return
            camera = ops.camera_ready and not ops.state["staff_mode"]
            if not camera:
                self._exception(
                    seen,
                    "camera",
                    "Automatic seating is on hold",
                    "Fresh camera evidence is unavailable or staff mode is active. Tasks continue; verify tables in person or reconnect the camera.",
                    "critical",
                )
            ops.reconcile_tasks()
            for table in ops.state["tables"]:
                if table.get("blocked") or table["manual_hold"]:
                    continue
                fresh_table = now - table.get("observed_at", -10000) <= 5
                if camera and not fresh_table:
                    self._exception(
                        seen,
                        f"observation:{table['id']}",
                        "Table evidence is stale",
                        f"{table['name']} has no recent observation. Automatic transitions are held for this table.",
                        table_id=table["id"],
                    )
                    continue
                if (
                    camera
                    and table["status"] == "cleaning_required"
                    and table["observed"] in ("present", "pending_arrival")
                ):
                    cleaning_in_progress = any(
                        t["kind"] == "cleaning"
                        and t["table_id"] == table["id"]
                        and t["status"] == "in_progress"
                        for t in ops.state["tasks"]
                    )
                    if not cleaning_in_progress:
                        self._exception(
                            seen,
                            f"cleaning-conflict:{table['id']}",
                            "Activity at a table awaiting cleaning",
                            f"{table['name']} is still marked dirty, but the camera sees activity. Cleaning completion is held until the table is empty.",
                            table_id=table["id"],
                        )
                if (
                    camera
                    and table["observed"]
                    in ("unknown", "pending_arrival", "pending_departure")
                    and now - table.get("observed_since", now) >= 30
                ):
                    self._exception(
                        seen,
                        f"uncertain:{table['id']}",
                        "Camera cannot settle a table state",
                        f"{table['name']} needs an in-person check. No automatic departure or seating will use uncertain evidence.",
                        table_id=table["id"],
                    )
                if (
                    camera
                    and table["status"] == "needs_verification"
                    and table["observed"] == "absent"
                ):
                    ops.ensure_task(
                        table["id"],
                        "cleaning",
                        "automation",
                        "Check this table is empty and clean before its first allocation.",
                    )
                if table["status"] != "occupied":
                    continue
                party = next(
                    (p for p in ops.state["parties"] if p["id"] == table["party_id"]),
                    None,
                )
                if (
                    table["seen_present"]
                    and party
                    and not party.get("arrival_confirmed")
                ):
                    party["arrival_confirmed"] = True
                    ops.record_automation(
                        "arrival_confirmed",
                        f"Arrival at {table['name']} confirmed by vision.",
                        table_id=table["id"],
                        party_id=party["id"],
                    )
                    for task in ops.state["tasks"]:
                        if (
                            task["kind"] == "seating"
                            and task.get("party_id") == party["id"]
                            and task["status"] in ACTIVE
                        ):
                            task.update(
                                status="completed",
                                completed_at=now,
                                completion_origin="vision",
                            )
                if (
                    camera
                    and table["observed"] == "absent"
                    and table["seen_present"]
                    and not table.get("review_dismissed")
                    and not table.get("verification_hold")
                    and now >= table["grace_until"]
                    and now - table.get("observed_since", now)
                    >= config["departure_seconds"]
                ):
                    ops.depart(table, "automation")
                    ops.record_automation(
                        "departure",
                        f"Sustained vacancy at {table['name']}; cleaning dispatched.",
                        table_id=table["id"],
                    )
                elif (
                    party
                    and not party.get("arrival_confirmed")
                    and now - party["seated_at"] >= config["seating_timeout_seconds"]
                ):
                    self._exception(
                        seen,
                        f"arrival:{party['id']}",
                        "Guest arrival needs a check",
                        f"{party['name']} was allocated {table['name']}, but arrival has not been confirmed. The table remains reserved.",
                        table_id=table["id"],
                        party_id=party["id"],
                    )
                elif table.get("review_dismissed") and table["observed"] == "absent":
                    self._exception(
                        seen,
                        f"departure:{table['id']}",
                        "Departure evidence conflicts with staff",
                        "The reservation is held until fresh presence or an in-person departure check.",
                        table_id=table["id"],
                    )
            ops.reconcile_tasks()
            # Reserve only as much work as the roster can carry. A waiter can host
            # guests when no dedicated host has been configured.
            if camera:
                role = (
                    "host"
                    if any(p["role"] == "host" for p in ops.state["staff"])
                    else "waiter"
                )
                for _ in range(len(ops.state["tables"])):
                    recs = [
                        rec
                        for rec in ops.recommendations()
                        if now - ops.table(rec["table_id"]).get("observed_at", -10000)
                        <= 5
                    ]
                    if not recs:
                        break
                    capacity = (
                        sum(
                            1
                            for p in ops.state["staff"]
                            if p["role"] == role and p.get("available", True)
                        )
                        * config["max_tasks_per_staff"]
                    )
                    load = sum(
                        t["role"] == role and t["status"] in ACTIVE
                        for t in ops.state["tasks"]
                    )
                    if load >= capacity:
                        if not capacity:
                            self._exception(
                                seen,
                                f"staff:{role}",
                                f"No available {role}",
                                "Seating is waiting for a staff member to guide guests.",
                                role=role,
                            )
                        break
                    rec = recs[0]
                    if self._await_memory(rec):
                        break
                    if now - ops.table(rec["table_id"]).get("observed_at", -10000) > 5:
                        break
                    target, evidence = self._memory_choice(rec)
                    ops.seat(
                        rec["party_id"],
                        target,
                        ops.state["version"],
                        override=target != rec["table_id"],
                        origin="automation",
                        evidence=evidence,
                    )
                # Extra chairs are routine only after a real, still-active space
                # check has been recalled. First-time checks remain exceptions.
                if self.supervisor:
                    for option in ops.extra_chair_options():
                        if option["alternative"]:
                            continue
                        memory = self.supervisor.chair_status(option["table_id"])
                        if (
                            memory.get("status") != "found"
                            or not memory.get("fact_id")
                            or memory.get("max_extra_chairs", 0)
                            < option["extra_chairs"]
                        ):
                            continue
                        load = sum(
                            t["role"] == role and t["status"] in ACTIVE
                            for t in ops.state["tasks"]
                        )
                        capacity = (
                            sum(
                                p["role"] == role and p.get("available", True)
                                for p in ops.state["staff"]
                            )
                            * config["max_tasks_per_staff"]
                        )
                        if load >= capacity:
                            break
                        if (
                            now
                            - ops.table(option["table_id"]).get("observed_at", -10000)
                            > 5
                        ):
                            continue
                        # Re-read options after each allocation; two parties must
                        # never reserve the same remembered table.
                        if not any(
                            o["party_id"] == option["party_id"]
                            and o["table_id"] == option["table_id"]
                            for o in ops.extra_chair_options()
                        ):
                            continue
                        ops.seat(
                            option["party_id"],
                            option["table_id"],
                            ops.state["version"],
                            extra_chairs=option["extra_chairs"],
                            origin="automation",
                            evidence={
                                "source_id": memory["source_id"],
                                "fact_id": memory["fact_id"],
                                "reason": "Recalled space check permits extra chairs.",
                            },
                        )
                largest = max(t["capacity"] for t in ops.state["tables"])
                for party in ops.state["parties"]:
                    if party["status"] != "waiting":
                        continue
                    if party["size"] > largest:
                        self._exception(
                            seen,
                            f"capacity:{party['id']}",
                            "Party needs a seating exception",
                            f"{party['name']} has {party['size']} guests; largest standard table seats {largest}. Review extra chairs or a combined table.",
                            party_id=party["id"],
                        )
                    elif (
                        now - party["arrived_at"]
                        >= ops.state["policy"]["max_wait_minutes"] * 60
                    ):
                        self._exception(
                            seen,
                            f"wait:{party['id']}",
                            "Guest wait target exceeded",
                            f"{party['name']} is still waiting. Queue protection remains active.",
                            party_id=party["id"],
                        )
            self._dispatch(seen)
            for arrival in ops.state["arrivals"]:
                if (
                    arrival["status"] == "pending"
                    and now - arrival["observed_at"] >= 120
                ):
                    self._exception(
                        seen,
                        f"door:{arrival['id']}",
                        "Door activity needs a check",
                        "An unresolved camera crossing is still pending. Help guests find self check-in, or dismiss a staff/passers-by crossing; the camera cannot establish identity or party size.",
                        arrival_id=arrival["id"],
                    )
            for item in ops.state["exceptions"]:
                if (
                    item["status"] in ("open", "acknowledged")
                    and item["key"] not in seen
                ):
                    item.update(status="resolved", resolved_at=now)
                    ops.record_automation(
                        "recovery",
                        f"Resolved: {item['title']}",
                        exception_id=item["id"],
                    )
            # Keep active incidents, plus a bounded resolved history.
            active = [e for e in ops.state["exceptions"] if e["status"] != "resolved"]
            closed = [e for e in ops.state["exceptions"] if e["status"] == "resolved"][
                :100
            ]
            ops.state["exceptions"] = active + closed
            if before != (
                ops.state["tables"],
                ops.state["tasks"],
                ops.state["exceptions"],
            ):
                ops.save()

    def run(self):
        while not self.stopping.wait(1):
            try:
                self.tick()
            except Exception as exc:  # noqa: BLE001 - keep the control loop alive and escalate failures
                with self.ops.lock:
                    message = f"Automation stopped this cycle ({type(exc).__name__})."
                    self.ops.state["automation"]["last_error"] = message
                    self._exception(
                        set(),
                        "engine",
                        "Automation needs attention",
                        message,
                        "critical",
                    )
                    self.ops.save()

    def start(self):
        self.worker = threading.Thread(
            target=self.run, name="floor-autonomy", daemon=True
        )
        self.worker.start()

    def close(self):
        self.stopping.set()
        if self.worker:
            self.worker.join(timeout=5)
