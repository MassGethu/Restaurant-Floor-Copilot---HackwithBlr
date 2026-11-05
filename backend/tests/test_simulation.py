import copy
import pytest
from test_operations import floor, make_ready
from app.simulation import simulate
from app.decisions import allocate


def test_future_wait_changes_when_pair_takes_only_large_table(floor):
    make_ready(floor)
    pair = floor.add_party("Pair", 2)
    floor.add_party("Six", 6)
    before = copy.deepcopy(floor.state)
    result = simulate(floor.state, pair["id"], "T3")
    assert result["baseline"]["min"]["total_guest_wait_minutes"] == 0
    assert result["proposed"]["min"]["total_guest_wait_minutes"] == 6 * 32
    assert result["proposed"]["max"]["total_guest_wait_minutes"] == 6 * 65
    assert floor.state == before


def test_unknown_table_and_invalid_delay_are_not_simulated(floor):
    pair = floor.add_party("Pair", 2)
    with pytest.raises(ValueError):
        simulate(floor.state, pair["id"], "T1")
    make_ready(floor)
    with pytest.raises(ValueError):
        simulate(floor.state, pair["id"], "T1", 20, 10)


def test_policies_balance_guests_and_protect_overdue_parties():
    tables = [
        dict(id="T1", capacity=6, status="ready", observed="absent", manual_hold=False)
    ]
    waiting = [
        dict(id="old", size=2, arrived_at=0),
        dict(id="large", size=6, arrived_at=10),
    ]
    assert allocate(waiting, tables, [])[0][0]["id"] == "old"
    assert (
        allocate(
            waiting,
            tables,
            [],
            dict(strategy="throughput", max_wait_minutes=15),
            now=20,
        )[0][0]["id"]
        == "large"
    )
    assert (
        allocate(
            waiting, tables, [], dict(strategy="throughput", max_wait_minutes=1), now=65
        )[0][0]["id"]
        == "old"
    )


def test_matching_does_not_assign_one_table_twice():
    tables = [
        dict(
            id=f"T{i}", capacity=c, status="ready", observed="absent", manual_hold=False
        )
        for i, c in enumerate([2, 4, 6])
    ]
    parties = [
        dict(id=str(i), size=s, arrived_at=0) for i, s in enumerate([2, 2, 4, 6])
    ]
    for strategy in ("balanced", "throughput"):
        result = allocate(
            parties, tables, [], dict(strategy=strategy, max_wait_minutes=15), now=0
        )
        assert len({t["id"] for _, t in result}) == len(result)
        assert all(p["size"] <= t["capacity"] for p, t in result)
