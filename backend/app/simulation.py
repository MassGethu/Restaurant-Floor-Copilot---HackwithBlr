"""Event-driven what-if schedules on known parties and explicit assumptions."""

import copy
from app.decisions import allocate, ready_table


def simulate(
    state, chosen_party=None, chosen_table=None, delay_minutes=0, horizon_minutes=120
):
    """Compare the current policy against a staff-chosen immediate assignment.

    Future table slots use duration assumptions, never an untrained prediction.
    Uncertain/overdue tables are omitted. No invented future arrivals are added.
    """
    waiting = [p for p in state["parties"] if p["status"] == "waiting"]
    if delay_minutes > horizon_minutes:
        raise ValueError("Delay must fit within the simulation horizon.")
    party = next((p for p in waiting if p["id"] == chosen_party), None)
    table = next((t for t in state["tables"] if t["id"] == chosen_table), None)
    if chosen_party is not None:
        if (
            party is None
            or table is None
            or not ready_table(table)
            or table["capacity"] < party["size"]
        ):
            raise ValueError(
                "Select a waiting party and a currently ready table with enough capacity."
            )

    def schedule(bound, override):
        assumptions = state["assumptions"]
        now = state["now"]
        clock = 0
        pending = copy.deepcopy(waiting)
        slots = []
        seated = []
        excluded = []
        for original in state["tables"]:
            slot = copy.deepcopy(original)
            available = None
            if original.get("blocked") or original.get("departure_review"):
                excluded.append(original["id"])
                continue
            if ready_table(original):
                available = 0
            elif original["status"] == "cleaning_required":
                available = assumptions[f"cleaning_{bound}"]
            elif original["status"] == "occupied" and original["duration_known"]:
                elapsed = (now - original["occupied_since"]) / 60
                if elapsed < assumptions["dining_max"]:
                    available = (
                        max(0, assumptions[f"dining_{bound}"] - elapsed)
                        + assumptions[f"cleaning_{bound}"]
                    )
            if available is None:
                excluded.append(original["id"])
                continue
            slot["available"] = available
            slots.append(slot)
        if override and party:
            forced = next(s for s in slots if s["id"] == table["id"])
            seated.append(
                dict(
                    party_id=party["id"],
                    name=party["name"],
                    size=party["size"],
                    table_id=table["id"],
                    wait_minutes=delay_minutes,
                    unused_seats=table["capacity"] - party["size"],
                )
            )
            forced["available"] = (
                delay_minutes
                + assumptions[f"dining_{bound}"]
                + assumptions[f"cleaning_{bound}"]
            )
            pending = [p for p in pending if p["id"] != party["id"]]
        for _ in range(500):
            if not pending or not slots:
                break
            clock = max(clock, min(s["available"] for s in slots))
            if clock > horizon_minutes:
                break
            ready = [
                dict(s, status="ready", observed="absent", seating_eligible=True)
                for s in slots
                if s["available"] <= clock
            ]
            assignments = allocate(
                pending,
                ready,
                state.get("declined", []) if clock == 0 else [],
                state["policy"],
                now + clock * 60,
            )
            if not assignments:
                future = [s["available"] for s in slots if s["available"] > clock]
                if not future:
                    break
                clock = min(future)
                continue
            for group, seat in assignments:
                seated.append(
                    dict(
                        party_id=group["id"],
                        name=group["name"],
                        size=group["size"],
                        table_id=seat["id"],
                        wait_minutes=round(clock, 2),
                        unused_seats=seat["capacity"] - group["size"],
                    )
                )
                next(s for s in slots if s["id"] == seat["id"])["available"] = (
                    clock
                    + assumptions[f"dining_{bound}"]
                    + assumptions[f"cleaning_{bound}"]
                )
                pending = [p for p in pending if p["id"] != group["id"]]
            clock += 0.000001
        return dict(
            seated=seated,
            parties_seated=len(seated),
            guests_seated=sum(p["size"] for p in seated),
            total_guest_wait_minutes=round(
                sum(p["size"] * p["wait_minutes"] for p in seated), 2
            ),
            unused_seats=sum(p["unused_seats"] for p in seated),
            unseated=[p["name"] for p in pending],
            excluded_tables=excluded,
        )

    baseline = {b: schedule(b, False) for b in ("min", "max")}
    return dict(
        horizon_minutes=horizon_minutes,
        baseline=baseline,
        proposed={b: schedule(b, True) for b in ("min", "max")}
        if party is not None
        else copy.deepcopy(baseline),
        assumptions=state["assumptions"],
        note="Deterministic scenarios, not guaranteed forecasts. Known queue only; parallel cleaning and configured dining ranges assumed. Unknown/overdue tables excluded. A delayed choice reserves that table until its chosen party is seated.",
    )
