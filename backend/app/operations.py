"""Persistent restaurant state. Vision supplies evidence; staff approve readiness.

All transitions and seating checks run under one lock and SQLite transaction.
The snapshot is small (one restaurant) and versioned to reject stale approvals.
Replay uses footage time. Live and staff-led service use a persisted wall-clock origin.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import sqlite3
import threading
import time
import uuid
from pathlib import Path

from app.decisions import allocate, compare_tables
from app.service import ServiceMixin


class OperationError(ValueError):
    pass


STAFF_CHECK_SECONDS = 60


class Operations(ServiceMixin):
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=15)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS floor_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)"
        )
        row = self.db.execute("SELECT payload FROM floor_state WHERE id=1").fetchone()
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS floor_sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL)"
        )
        self.state = json.loads(row[0]) if row else self.empty()
        for task in self.state.get("tasks", []):
            task.setdefault("priority", "normal")
        defaults = self.empty()
        for key in (
            "tasks",
            "staff",
            "arrivals",
            "policy",
            "trend",
            "completed_sessions",
            "counters",
            "staff_mode",
            "service_epoch",
        ):
            self.state.setdefault(key, defaults[key])
        self._entrance_tracks = {}
        self._arrival_cooldowns = {}
        # Persisted observations are never treated as fresh after a process restart.
        self.fresh = False
        self.source = "NO SOURCE"
        self.model = "loading"

    @staticmethod
    def empty():
        return dict(
            session_id=str(uuid.uuid4()),
            video_id=None,
            version=0,
            now=0.0,
            tables=[],
            parties=[],
            events=[],
            declined=[],
            tasks=[],
            arrivals=[],
            trend=[],
            completed_sessions=[],
            counters=dict(manager_overrides=0),
            staff_mode=False,
            service_epoch=None,
            staff=[
                dict(id="waiter-1", name="Waiter 1", role="waiter"),
                dict(id="cleaner-1", name="Cleaner 1", role="cleaner"),
            ],
            policy=dict(strategy="fairness", max_wait_minutes=15, check_in_minutes=10),
            assumptions=dict(
                dining_min=30, dining_max=60, cleaning_min=2, cleaning_max=5
            ),
        )

    @staticmethod
    def fail(message):
        raise OperationError(message)

    def close(self):
        self.db.close()

    @property
    def camera_ready(self):
        return self.fresh and self.source == "LIVE" and self.model == "ready"

    def advance_clock(self):
        """Call under the floor lock before a request or observation uses service time."""
        wall = time.time()
        epoch = self.state["service_epoch"]
        if epoch is not None:
            self.state["now"] = max(self.state["now"], wall - epoch)
        changed = False
        for table in self.state["tables"]:
            if table["manual_hold"] and (table.get("hold_until") or 0) <= wall:
                table.update(manual_hold=False, hold_until=None)
                if table["status"] == "ready":
                    table.update(
                        status="needs_verification",
                        note="Staff readiness check expired.",
                    )
                changed = True
        if changed:
            self.save()

    def set_staff_mode(self, enabled):
        with self.lock:
            self.advance_clock()
            if enabled == self.state["staff_mode"]:
                return
            if not self.state["tables"]:
                self.fail(
                    "Configure the floor before starting staff-confirmed service."
                )
            if not enabled and not self.camera_ready:
                self.fail(
                    "Wait for fresh camera observations before leaving staff mode."
                )
            if enabled and self.state["service_epoch"] is None:
                self.state["service_epoch"] = time.time() - self.state["now"]
            self.state["staff_mode"] = enabled
            for table in self.state["tables"]:
                if table["manual_hold"] and table["status"] == "ready":
                    table.update(
                        manual_hold=False, hold_until=None, status="needs_verification"
                    )
            self.event(
                "Staff-confirmed service started. Check each table in person before seating."
                if enabled
                else "Camera-assisted service resumed after staff review.",
                "staff",
            )
            self.save()

    def validate_session_change(self, video_id, reset):
        if self.state["service_epoch"] is None:
            return
        if not reset and video_id == self.state["video_id"]:
            return
        if any(
            p["status"] in ("waiting", "seated") for p in self.state["parties"]
        ) or any(
            t["status"] in ("open", "acknowledged", "in_progress")
            for t in self.state["tasks"]
        ):
            self.fail(
                "Finish or reconcile open service work before starting a new replay. Use Reconnect to keep this floor."
            )

    def invalidate_camera(self):
        with self.lock:
            self.fresh = False
            self.source = "RECONNECTING"
            self._entrance_tracks.clear()
            if self.state["service_epoch"] is not None and not self.state["staff_mode"]:
                ready = [t for t in self.state["tables"] if t["status"] == "ready"]
                for table in ready:
                    table.update(
                        status="needs_verification",
                        manual_hold=False,
                        hold_until=None,
                        note="Camera connection changed. Confirm readiness in person.",
                    )
                if ready:
                    self.event(
                        "Camera connection changed. Check the previously ready tables.",
                        "system",
                    )
                    self.save()

    def update_camera(self, source, model, fresh):
        with self.lock:
            if self.camera_ready and not (
                source == "LIVE" and model == "ready" and fresh
            ):
                self.invalidate_camera()
            self.source, self.model, self.fresh = source, model, fresh
            self.advance_clock()

    def save(self):
        self.reconcile_tasks()
        point = dict(
            minute=int(self.state["now"] // 60),
            occupied=sum(t["status"] == "occupied" for t in self.state["tables"]),
            ready=sum(t["status"] == "ready" for t in self.state["tables"]),
            cleaning=sum(
                t["status"] == "cleaning_required" for t in self.state["tables"]
            ),
            waiting=sum(p["status"] == "waiting" for p in self.state["parties"]),
        )
        if self.state["trend"] and self.state["trend"][-1]["minute"] == point["minute"]:
            self.state["trend"][-1] = point
        else:
            self.state["trend"].append(point)
        self.state["trend"] = self.state["trend"][-720:]
        self.state["version"] += 1
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO floor_state VALUES (1, ?)",
                (json.dumps(self.state),),
            )

    def event(self, text: str, origin: str):
        self.state["events"].insert(
            0,
            dict(
                id=str(uuid.uuid4()),
                text=text,
                origin=origin,
                scenario_time=self.state["now"],
                recorded_at=time.time(),
            ),
        )
        del self.state["events"][100:]

    def configure(self, video_id, tables, reset=False, *, live=False):
        tables = [
            table for table in tables if getattr(table, "kind", "table") == "table"
        ]
        with self.lock:
            self.advance_clock()
            self.validate_session_change(video_id, reset)
            if not reset and self.state["video_id"] == video_id:
                self.validate_configuration(tables)
            if reset or self.state["video_id"] != video_id:
                saved_settings = {
                    key: copy.deepcopy(self.state[key])
                    for key in ("policy", "staff", "assumptions")
                }
                if self.state["tables"]:
                    with self.db:
                        self.db.execute(
                            "INSERT OR REPLACE INTO floor_sessions VALUES (?,?)",
                            (self.state["session_id"], json.dumps(self.state)),
                        )
                self.state = self.empty()
                self.state.update(saved_settings)
                self._entrance_tracks = {}
                self._arrival_cooldowns = {}
                self.state["video_id"] = video_id
                self.event(
                    "New playback session. Confirm initial table readiness.", "system"
                )
                self.fresh = False
            old = {t["id"]: copy.deepcopy(t) for t in self.state["tables"]}
            configured = []
            for table in tables:
                item = old.get(
                    table.id,
                    dict(
                        id=table.id,
                        status="needs_verification",
                        observed="unknown",
                        occupied_since=None,
                        duration_known=False,
                        dirty_since=None,
                        party_id=None,
                        manual_hold=False,
                        grace_until=0,
                        seen_present=False,
                        people_count=0,
                        note="Initial cleanliness has not been confirmed.",
                    ),
                )
                region = [list(point) for point in table.polygon]
                if item.get("region") is not None and item["region"] != region:
                    item.update(
                        status="needs_verification",
                        observed="unknown",
                        manual_hold=False,
                        verification_hold=True,
                        note="Table region changed. Staff must verify this table.",
                    )
                    self.fresh = False
                    self.event(
                        f"{table.name}: region changed; staff verification required.",
                        "system",
                    )
                item.update(name=table.name, capacity=table.capacity, region=region)
                configured.append(item)
            start_clock = live and self.state["service_epoch"] is None
            if start_clock:
                self.state["service_epoch"] = time.time() - self.state["now"]
            if configured != self.state["tables"] or reset or start_clock:
                self.state["tables"] = configured
                self.save()

    def validate_configuration(self, tables):
        """Validate before saving either configuration or operational state."""
        proposed = {
            table.id: table
            for table in tables
            if getattr(table, "kind", "table") == "table"
        }
        for party in self.state["parties"]:
            if party["status"] != "seated":
                continue
            table = proposed.get(party["table_id"])
            if table is None:
                raise OperationError(
                    "Confirm departure before removing a table with a seated party."
                )
            if table.capacity < party["size"]:
                raise OperationError(
                    "Table capacity cannot be smaller than its seated party."
                )

    def observe(self, video_id, states, now, fresh=True, observation_time=None):
        with self.lock:
            if video_id != self.state["video_id"]:
                return
            self.advance_clock()
            self.fresh = fresh
            if self.state["service_epoch"] is None:
                self.state["now"] = max(self.state["now"], now)
            now = self.state["now"]
            changed = False
            by_id = {s.table_id: s for s in states}
            for table in self.state["tables"]:
                state = by_id.get(table["id"])
                if state is None:
                    continue
                observed = {
                    "AVAILABLE": "absent",
                    "OCCUPIED": "present",
                    "PENDING_OCCUPIED": "pending_arrival",
                    "PENDING_AVAILABLE": "pending_departure",
                }[state.status.value]
                table["people_count"] = state.people_count
                previous = table["observed"]
                table["observed"] = observed
                if previous != observed:
                    changed = True
                if observed == "present":
                    if table.get("departure_review") or table.get("review_dismissed"):
                        table.update(departure_review=False, review_dismissed=False)
                        changed = True
                    if table["manual_hold"] and table["status"] == "ready":
                        table.update(
                            status="needs_verification",
                            manual_hold=False,
                            hold_until=None,
                            note="Camera sees someone after the staff check. Verify the table again.",
                        )
                        changed = True
                if self.state["staff_mode"] or table["status"] == "cleaning_required":
                    continue
                if table["manual_hold"] or table.get("verification_hold", False):
                    continue
                if table.get("departure_hold", False):
                    if observed != "absent":
                        continue
                    table["departure_hold"] = False
                    changed = True
                if observed == "present":
                    if table["status"] != "occupied":
                        was_ready = table["status"] == "ready"
                        started = now
                        if (
                            observation_time is not None
                            and getattr(state, "occupied_since", None) is not None
                        ):
                            started = max(
                                0.0, now - (observation_time - state.occupied_since)
                            )
                        table.update(
                            status="occupied",
                            occupied_since=started,
                            duration_known=was_ready,
                            seen_present=True,
                            dirty_since=None,
                            note="Sustained presence confirmed by vision.",
                        )
                        self.event(
                            f"{table['name']}: occupied, confirmed by vision.", "vision"
                        )
                        changed = True
                    elif not table["seen_present"]:
                        table["seen_present"] = True
                        changed = True
                elif (
                    observed == "absent"
                    and table["status"] == "occupied"
                    and now >= table["grace_until"]
                ):
                    if not table.get("departure_review") and not table.get(
                        "review_dismissed"
                    ):
                        table.update(
                            departure_review=True,
                            note="Camera reports vacancy. Check the table before confirming departure.",
                        )
                        self.event(f"{table['name']}: check for departure.", "vision")
                        changed = True
            if (
                changed
                or self.reconcile_tasks()
                or not self.state["trend"]
                or int(now // 60) != self.state["trend"][-1]["minute"]
            ):
                self.save()

    def depart(self, table, origin):
        party = next(
            (p for p in self.state["parties"] if p["id"] == table["party_id"]), None
        )
        if table["occupied_since"] is not None:
            self.state["completed_sessions"].append(
                dict(
                    table_id=table["id"],
                    capacity=table["capacity"],
                    started_at=table["occupied_since"],
                    ended_at=self.state["now"],
                    duration_seconds=max(
                        0, self.state["now"] - table["occupied_since"]
                    ),
                    duration_known=table["duration_known"],
                    origin=origin,
                )
            )
        if party:
            party["status"] = "departed"
            party["departed_at"] = self.state["now"]
        table.update(
            status="cleaning_required",
            dirty_since=self.state["now"],
            dirty_origin=origin,
            party_id=None,
            occupied_since=None,
            duration_known=False,
            seen_present=False,
            departure_review=False,
            review_dismissed=False,
            note="Departure confirmed. Staff must confirm cleaning.",
        )
        self.event(f"{table['name']}: cleaning required.", origin)
        self.state["declined"] = [
            pair for pair in self.state.get("declined", []) if pair[1] != table["id"]
        ]

    def table(self, table_id):
        table = next((t for t in self.state["tables"] if t["id"] == table_id), None)
        if not table:
            raise OperationError("Table not found.")
        return table

    def add_party(self, name, size, *, request_id=None, session_id=None):
        with self.lock:
            self.advance_clock()
            if session_id is not None and session_id != self.state["session_id"]:
                self.fail(
                    "The floor session changed. Review the queue before submitting again."
                )
            name = name.strip()[:60]
            if request_id:
                previous = next(
                    (
                        p
                        for p in self.state["parties"]
                        if p.get("request_id") == request_id
                    ),
                    None,
                )
                if previous:
                    if previous["request_name"] != name or previous["size"] != size:
                        self.fail(
                            "This queue request was already used for a different party."
                        )
                    return copy.deepcopy(previous)
            if not self.state["video_id"] or not self.state["tables"]:
                raise OperationError(
                    "Start footage and configure tables before adding a party."
                )
            if not 1 <= size <= 20:
                raise OperationError("Party size must be between 1 and 20.")
            if sum(p["status"] == "waiting" for p in self.state["parties"]) >= 100:
                raise OperationError("Queue is full.")
            party = dict(
                id=str(uuid.uuid4()),
                name=name or f"Party {len(self.state['parties']) + 1}",
                size=size,
                arrived_at=self.state["now"],
                status="waiting",
                table_id=None,
            )
            if request_id:
                party.update(request_id=request_id, request_name=name)
            self.state["parties"].append(party)
            self.event(f"{party['name']} joined the queue ({size} guests).", "staff")
            self.save()
            return copy.deepcopy(party)

    def cancel(self, party_id):
        with self.lock:
            party = next(
                (p for p in self.state["parties"] if p["id"] == party_id), None
            )
            if not party or party["status"] != "waiting":
                raise OperationError("Only waiting parties can be removed.")
            party["status"] = "cancelled"
            self.event(f"{party['name']} left the queue.", "staff")
            self.save()

    def set_assumptions(self, values):
        with self.lock:
            if not (
                1 <= values["dining_min"] <= values["dining_max"] <= 240
                and 1 <= values["cleaning_min"] <= values["cleaning_max"] <= 60
            ):
                raise OperationError(
                    "Use ordered dining ranges within 1–240 minutes and cleaning ranges within 1–60 minutes."
                )
            self.state["assumptions"] = dict(values)
            self.event(
                "Staff updated dining and cleaning assumptions; wait ranges recalculated.",
                "staff",
            )
            self.save()

    def table_key(self, table):
        fields = (
            "id",
            "status",
            "party_id",
            "occupied_since",
            "observed",
            "hold_until",
            "blocked",
            "departure_review",
            "capacity",
            "region",
        )
        return hashlib.sha256(
            json.dumps([self.state["session_id"], *[table.get(k) for k in fields]]).encode()
        ).hexdigest()

    def action(self, table_id, action, *, table_key=None):
        with self.lock:
            self.advance_clock()
            table = self.table(table_id)
            if table_key is not None and table_key != self.table_key(table):
                self.fail(
                    "This table changed. Review the current table before confirming."
                )
            staff_mode = self.state["staff_mode"]
            if action in ("clean", "hold_ready"):
                if table["party_id"]:
                    self.fail("Resolve the seated party before confirming readiness.")
                if table["status"] not in (
                    "cleaning_required",
                    "needs_verification",
                    "ready",
                ):
                    raise OperationError(
                        "Confirm departure before marking an occupied table ready."
                    )
                if self.camera_ready and table["observed"] != "absent":
                    self.fail(
                        "Fresh confirmed absence is required. Camera activity conflicts with readiness."
                    )
                if not self.camera_ready and not staff_mode:
                    self.fail(
                        "Fresh camera observations are required. Start staff-confirmed mode to check in person."
                    )
                if table.get("blocked"):
                    self.fail("Remove the table block before confirming readiness.")
                temporary = staff_mode or action == "hold_ready"
                table.update(
                    status="ready",
                    occupied_since=None,
                    dirty_since=None,
                    manual_hold=temporary,
                    hold_until=time.time() + STAFF_CHECK_SECONDS if temporary else None,
                    verification_hold=False,
                    departure_hold=False,
                    departure_review=False,
                    review_dismissed=False,
                    note="Staff confirmed empty and clean. Recheck after 60 seconds."
                    if temporary
                    else "Clean and ready, confirmed by staff.",
                )
                self.state["declined"] = [
                    pair
                    for pair in self.state.get("declined", [])
                    if pair[1] != table_id
                ]
            elif action == "depart":
                if table["status"] != "occupied" and not table["party_id"]:
                    raise OperationError("This table has no occupied session to end.")
                self.depart(table, "staff")
                table["manual_hold"] = False
                table["hold_until"] = None
                table["verification_hold"] = False
                table["departure_hold"] = table["observed"] != "absent"
            elif action == "still_seated":
                if not table.get("departure_review"):
                    self.fail("There is no departure check to dismiss.")
                table.update(
                    departure_review=False,
                    review_dismissed=True,
                    note="Staff confirmed the party is still seated.",
                )
            elif action == "hold_occupied":
                table.update(
                    status="occupied",
                    manual_hold=True,
                    hold_until=time.time() + STAFF_CHECK_SECONDS,
                    verification_hold=False,
                    departure_hold=False,
                    departure_review=False,
                    occupied_since=table["occupied_since"]
                    if table["occupied_since"] is not None
                    else self.state["now"],
                    note="Staff confirmed occupied. Recheck after 60 seconds.",
                )
            elif action in ("block", "unblock"):
                blocked = action == "block"
                table.update(
                    blocked=blocked,
                    manual_hold=False,
                    hold_until=None,
                    note="Staff blocked this table from walk-in seating."
                    if blocked
                    else "Table block removed. Confirm readiness before seating.",
                )
                if table["status"] == "ready":
                    table["status"] = "needs_verification"
            elif action == "release":
                if not table["manual_hold"]:
                    self.fail("There is no active staff check to end.")
                table.update(
                    manual_hold=False,
                    hold_until=None,
                    status="occupied" if table["party_id"] else "needs_verification",
                    note="Staff override released. Verify readiness or occupancy.",
                )
            else:
                raise OperationError("Unknown staff action.")
            self.event(f"{table['name']}: {table['note']}", "staff")
            self.save()

    def seating_eligible(self, table):
        if table["status"] != "ready" or table.get("blocked") or table["party_id"]:
            return False
        if self.state["staff_mode"]:
            return (
                table["manual_hold"]
                and (table.get("hold_until") or 0) > time.time()
                and (not self.camera_ready or table["observed"] == "absent")
            )
        return self.camera_ready and table["observed"] == "absent"

    def seating_key(self, allocations=None):
        state = self.state
        waiting = [
            (
                p["id"],
                p["size"],
                self.state["now"] - p["arrived_at"]
                >= state["policy"]["max_wait_minutes"] * 60,
            )
            for p in state["parties"]
            if p["status"] == "waiting"
        ]
        eligible = [
            (t["id"], t["name"], t["capacity"], t.get("hold_until"))
            for t in state["tables"]
            if self.seating_eligible(t)
        ]
        if allocations is None:
            allocations = allocate(
                [p for p in state["parties"] if p["status"] == "waiting"],
                [
                    dict(t, seating_eligible=self.seating_eligible(t))
                    for t in state["tables"]
                ],
                state["declined"],
                state["policy"],
                state["now"],
            )
        return hashlib.sha256(
            json.dumps(
                [
                    state["session_id"],
                    state["staff_mode"],
                    waiting,
                    eligible,
                    state["declined"],
                    state["policy"],
                    [(p["id"], t["id"]) for p, t in allocations],
                ],
                sort_keys=True,
            ).encode()
        ).hexdigest()

    def recommendations(self):
        if not self.camera_ready and not self.state["staff_mode"]:
            return []
        result = []
        waiting = [p for p in self.state["parties"] if p["status"] == "waiting"]
        declined = self.state.get("declined", [])
        policy = self.state["policy"]
        tables = [
            dict(t, seating_eligible=self.seating_eligible(t))
            for t in self.state["tables"]
        ]
        effective = (
            policy
            if sum(t["seating_eligible"] for t in tables) <= 8
            else {**policy, "strategy": "fairness"}
        )
        allocation = allocate(waiting, tables, declined, effective, self.state["now"])
        key = self.seating_key(allocation)
        for party, table in allocation:
            index = waiting.index(party)
            skipped = [
                p["name"]
                for p in waiting[:index]
                if p["id"] not in {r["party_id"] for r in result}
            ]
            reason = f"{table['name']} is staff-confirmed ready and its {table['capacity']} seats fit {party['size']} guests. Smallest suitable table; oldest feasible party first."
            if effective["strategy"] != "fairness":
                reason = f"{table['name']} fits {party['size']} guests with {table['capacity'] - party['size']} unused seats. The {effective['strategy']} preset compares guest count, party count, elapsed wait and unused seats across up to 12 feasible parties and 8 ready tables; overdue parties are protected."
            if skipped and effective["strategy"] == "fairness":
                reason += f" Earlier waiting parties have no eligible remaining table under capacity and staff decisions: {', '.join(skipped)}."
            if any(pair[0] == party["id"] for pair in self.state.get("declined", [])):
                reason += " Previously declined table options are excluded until their next departure/cleaning cycle."
            result.append(
                dict(
                    party_id=party["id"],
                    party_name=party["name"],
                    table_id=table["id"],
                    table_name=table["name"],
                    unused_seats=table["capacity"] - party["size"],
                    explanation=reason,
                    version=self.state["version"],
                    decision_key=key,
                    alternatives=compare_tables(
                        party,
                        waiting,
                        tables,
                        declined,
                        allocation,
                        effective,
                        self.state["now"],
                    ),
                )
            )
        return result

    def check_seating_request(self, version, decision_key):
        if decision_key is not None:
            current = decision_key == self.seating_key()
        else:
            current = version == self.state["version"]
        if not current:
            self.fail(
                "Seating choices changed. Review the updated options before confirming."
            )

    def decline(self, party_id, table_id, version, *, decision_key=None):
        with self.lock:
            self.advance_clock()
            self.check_seating_request(version, decision_key)
            if not any(
                r["party_id"] == party_id and r["table_id"] == table_id
                for r in self.recommendations()
            ):
                raise OperationError("This suggestion is no longer current.")
            self.state.setdefault("declined", []).append([party_id, table_id])
            party = next(p for p in self.state["parties"] if p["id"] == party_id)
            self.event(
                f"Staff declined {party['name']} at {self.table(table_id)['name']}; party remains waiting.",
                "staff",
            )
            self.save()

    def seat(self, party_id, table_id, version, override=False, *, decision_key=None):
        with self.lock:
            self.advance_clock()
            self.check_seating_request(version, decision_key)
            party = next(
                (
                    p
                    for p in self.state["parties"]
                    if p["id"] == party_id and p["status"] == "waiting"
                ),
                None,
            )
            table = self.table(table_id)
            eligible = (
                party is not None
                and self.seating_eligible(table)
                and table["capacity"] >= party["size"]
            )
            if not eligible:
                raise OperationError(
                    "The party or table is no longer eligible for seating."
                )
            recs = self.recommendations()
            recommendation = next((r for r in recs if r["party_id"] == party_id), None)
            if not override and (
                recommendation is None or recommendation["table_id"] != table_id
            ):
                self.fail("This allocation is no longer eligible.")
            if override:
                choice = next(
                    (
                        alt
                        for alt in (recommendation or {}).get("alternatives", [])
                        if alt["table_id"] == table_id
                    ),
                    None,
                )
                if choice is None:
                    self.fail("Review the current manager choices for this party.")
                if choice["displaced_party_names"]:
                    self.fail(
                        "This table choice would displace another waiting party. Choose a current option that protects the queue."
                    )
            if self.state["staff_mode"]:
                self.event(
                    f"{table['name']}: seated using the current staff readiness check.",
                    "staff",
                )
            party.update(
                status="seated", table_id=table_id, seated_at=self.state["now"]
            )
            if override:
                self.state["counters"]["manager_overrides"] += 1
            table.update(
                status="occupied",
                party_id=party_id,
                occupied_since=self.state["now"],
                duration_known=True,
                grace_until=self.state["now"] + 30,
                seen_present=False,
                manual_hold=False,
                hold_until=None,
                departure_review=False,
                review_dismissed=False,
                note=f"{party['name']} seated by staff; awaiting visual confirmation.",
            )
            prefix = "Manager override: " if override else ""
            self.event(f"{prefix}{party['name']} seated at {table['name']}.", "staff")
            self.save()

    def estimates(self):
        from app.simulation import simulate

        state = {
            **self.state,
            "tables": [
                dict(t, seating_eligible=self.seating_eligible(t))
                for t in self.state["tables"]
            ],
        }
        schedules = simulate(state, horizon_minutes=240)["baseline"]
        by_bound = {
            bound: {
                party["party_id"]: party["wait_minutes"] for party in value["seated"]
            }
            for bound, value in schedules.items()
        }
        estimates = {}
        for party in (p for p in self.state["parties"] if p["status"] == "waiting"):
            short = by_bound["min"].get(party["id"])
            long = by_bound["max"].get(party["id"])
            values = [value for value in (short, long) if value is not None]
            estimates[party["id"]] = dict(
                min_minutes=math.ceil(min(values)) if len(values) == 2 else None,
                max_minutes=math.ceil(max(values)) if len(values) == 2 else None,
                scenario_minutes=dict(
                    short_durations=math.ceil(short) if short is not None else None,
                    long_durations=math.ceil(long) if long is not None else None,
                ),
                note="Range spans two duration scenarios under the current allocation policy, a 240-minute horizon and parallel cleaning. Allocations can differ; this is not a guaranteed bound. Unknown/overdue tables and parties beyond the horizon require staff estimates.",
            )
        return estimates

    def snapshot(self, source=None, model=None, fresh=None):
        with self.lock:
            self.update_camera(
                self.source if source is None else source,
                self.model if model is None else model,
                self.fresh if fresh is None else fresh,
            )
            result = copy.deepcopy(self.state)
            for table in result["tables"]:
                table.update(
                    seating_eligible=self.seating_eligible(table),
                    table_key=self.table_key(table),
                    blocked=table.get("blocked", False),
                    departure_review=table.get("departure_review", False),
                )
            result["availability"] = self.availability()
            result["analytics"] = self.operational_analytics()
            result.update(
                source_status=self.source,
                model_state=self.model,
                observations_fresh=self.fresh,
                recommendations=self.recommendations(),
                wait_estimates=self.estimates()
                if self.camera_ready and not self.state["staff_mode"]
                else {},
            )
            waiting = [p for p in self.state["parties"] if p["status"] == "waiting"]
            dirty = [
                t for t in self.state["tables"] if t["status"] == "cleaning_required"
            ]
            result["cleaning_priorities"] = [
                dict(
                    table_id=t["id"],
                    table_name=t["name"],
                    explanation=(
                        f"Can accommodate {sum(p['size'] <= t['capacity'] for p in waiting)} waiting parties; oldest cleaning task breaks ties."
                    ),
                )
                for t in sorted(
                    dirty,
                    key=lambda t: (
                        -sum(p["size"] <= t["capacity"] for p in waiting),
                        t["dirty_since"],
                        t["id"],
                    ),
                )
            ]
            return result
