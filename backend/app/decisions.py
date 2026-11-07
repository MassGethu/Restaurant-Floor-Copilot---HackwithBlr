"""Pure, deterministic allocation and comparisons on the current queue.

No future arrivals or departure predictions are assumed here. Comparisons
measure the immediate queue effect if staff choose a different ready table.
"""


def ready_table(table):
    if "seating_eligible" in table:
        return table["seating_eligible"]
    return (
        table["status"] == "ready"
        and table["observed"] == "absent"
        and not table.get("blocked")
        and not table.get("party_id")
    )


def ready_tables(tables):
    return [table for table in tables if ready_table(table)]


def allocate(waiting, tables, declined, policy=None, now=0):
    free = list(ready_tables(tables))
    if policy and policy.get("strategy") != "fairness" and len(free) <= 8:
        return optimized_allocate(waiting, free, declined, policy, now)
    result = []
    for party in waiting:
        candidates = sorted(
            (
                table
                for table in free
                if table["capacity"] >= party["size"]
                and [party["id"], table["id"]] not in declined
            ),
            key=lambda table: (table["capacity"], table["id"]),
        )
        if candidates:
            chosen = candidates[0]
            result.append((party, chosen))
            free.remove(chosen)
    return result


def compare_tables(party, waiting, tables, declined, baseline, policy=None, now=0):
    remaining_parties = [p for p in waiting if p["id"] != party["id"]]
    baseline_others = {p["id"] for p, _ in baseline if p["id"] != party["id"]}
    comparisons = []
    for table in sorted(ready_tables(tables), key=lambda t: (t["capacity"], t["id"])):
        if table["capacity"] < party["size"]:
            continue
        remaining_tables = [t for t in tables if t["id"] != table["id"]]
        alternative = allocate(
            remaining_parties, remaining_tables, declined, policy, now
        )
        seated_others = {p["id"] for p, _ in alternative}
        comparisons.append(
            dict(
                table_id=table["id"],
                table_name=table["name"],
                capacity=table["capacity"],
                unused_seats=table["capacity"] - party["size"],
                other_parties_seatable_now=len(alternative),
                other_guests_seatable_now=sum(p["size"] for p, _ in alternative),
                displaced_party_names=[
                    p["name"]
                    for p in remaining_parties
                    if p["id"] in baseline_others - seated_others
                ],
            )
        )
    return comparisons


POLICY_WEIGHTS = {
    "balanced": dict(party=100, guest=10, wait=2, waste=3),
    "throughput": dict(party=20, guest=30, wait=1, waste=1),
}


def optimized_allocate(waiting, free, declined, policy, now):
    """Exact matching over up to eight ready tables and twelve feasible parties.

    Older overdue feasible parties receive lexicographic protection. Outside
    the bounded lookahead the queue remains waiting; no global optimality is
    claimed for an arbitrarily long queue.
    """
    from functools import lru_cache

    candidates = [
        p
        for p in waiting
        if any(
            t["capacity"] >= p["size"] and [p["id"], t["id"]] not in declined
            for t in free
        )
    ][:12]
    weights = POLICY_WEIGHTS[policy["strategy"]]

    @lru_cache(None)
    def best(index, mask):
        if index == len(candidates):
            return 0, ()
        winner = best(index + 1, mask)
        party = candidates[index]
        minutes = max(0, (now - party.get("arrived_at", now)) / 60)
        protected = (
            (2 ** (12 - index)) * 1_000_000
            if minutes >= policy["max_wait_minutes"]
            else 0
        )
        for table_index, table in enumerate(free):
            if (
                mask & (1 << table_index)
                or table["capacity"] < party["size"]
                or [party["id"], table["id"]] in declined
            ):
                continue
            utility = (
                weights["party"]
                + weights["guest"] * party["size"]
                + weights["wait"] * min(minutes, 60)
                - weights["waste"] * (table["capacity"] - party["size"])
                + protected
            )
            score, assignments = best(index + 1, mask | (1 << table_index))
            proposal = (score + utility, ((index, table_index),) + assignments)
            if proposal[0] > winner[0]:
                winner = proposal
        return winner

    return [(candidates[p], free[t]) for p, t in best(0, 0)[1]]
