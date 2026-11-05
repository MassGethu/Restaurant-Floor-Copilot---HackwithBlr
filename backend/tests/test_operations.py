"""Business invariants, independent of inference and realtime scheduling."""
from types import SimpleNamespace

import pytest

from app.operations import OperationError, Operations
from app.occupancy import TableStatus
from app.schemas import TableDef


def observation(table_id, status):
    return SimpleNamespace(table_id=table_id, status=TableStatus(status), people_count=int(status == 'OCCUPIED'))


@pytest.fixture
def floor(tmp_path):
    service = Operations(tmp_path / 'floor.db')
    service.configure('demo', [TableDef(id=f'T{i}', name=f'Table {i}', capacity=capacity,
        polygon=[(0, 0), (10, 0), (10, 10)]) for i, capacity in enumerate([2, 4, 6], 1)])
    service.observe('demo', [observation(f'T{i}', 'AVAILABLE') for i in range(1, 4)], 0)
    service.snapshot('LIVE', 'ready')
    yield service
    service.close()


def make_ready(floor):
    for table in floor.state['tables']:
        floor.action(table['id'], 'clean')


def test_vacancy_does_not_establish_cleanliness(floor):
    assert all(t['status'] == 'needs_verification' for t in floor.state['tables'])
    floor.add_party('A', 2)
    assert floor.recommendations() == []


def test_capacity_best_fit_and_oldest_feasible(floor):
    make_ready(floor)
    big = floor.add_party('Too big', 10)
    first = floor.add_party('Four guests', 4)
    second = floor.add_party('Two guests', 2)
    recs = floor.recommendations()
    assert [(r['party_id'], r['table_id']) for r in recs] == [(first['id'], 'T2'), (second['id'], 'T1')]
    assert big['id'] not in [r['party_id'] for r in recs]
    assert 'Too big' in recs[0]['explanation']


def test_stale_and_duplicate_approvals_are_rejected(floor):
    make_ready(floor)
    party = floor.add_party('A', 2)
    recommendation = floor.recommendations()[0]
    floor.add_party('B', 4)
    with pytest.raises(OperationError, match='changed'):
        floor.seat(party['id'], 'T1', recommendation['version'])
    version = floor.state['version']
    floor.seat(party['id'], 'T1', version)
    with pytest.raises(OperationError):
        floor.seat(party['id'], 'T1', version)


def test_seating_survives_miss_then_requests_verification(floor):
    make_ready(floor)
    party = floor.add_party('A', 2)
    floor.seat(party['id'], 'T1', floor.state['version'])
    floor.observe('demo', [observation('T1', 'AVAILABLE')], 2)
    assert floor.table('T1')['status'] == 'occupied'
    floor.observe('demo', [observation('T1', 'AVAILABLE')], 31)
    assert floor.table('T1')['status'] == 'needs_verification'
    with pytest.raises(OperationError, match='seated party'):
        floor.action('T1', 'clean')


def test_departure_requires_cleaning_and_closes_party(floor):
    make_ready(floor)
    party = floor.add_party('A', 2)
    floor.seat(party['id'], 'T1', floor.state['version'])
    floor.observe('demo', [observation('T1', 'OCCUPIED')], 5)
    floor.observe('demo', [observation('T1', 'PENDING_AVAILABLE')], 35)
    assert floor.table('T1')['status'] == 'occupied'
    floor.observe('demo', [observation('T1', 'AVAILABLE')], 41)
    assert floor.table('T1')['status'] == 'cleaning_required'
    assert floor.state['parties'][0]['status'] == 'departed'
    floor.action('T1', 'clean')
    assert floor.table('T1')['status'] == 'ready'


def test_override_survives_visual_conflict(floor):
    floor.action('T1', 'hold_occupied')
    floor.observe('demo', [observation('T1', 'AVAILABLE')], 100)
    assert floor.table('T1')['status'] == 'occupied'
    floor.action('T1', 'release')
    assert floor.table('T1')['status'] == 'needs_verification'


def test_cleaning_requires_fresh_confirmed_absence(floor):
    floor.fresh = False
    with pytest.raises(OperationError, match='Fresh'):
        floor.action('T1', 'clean')
    floor.observe('demo', [observation('T1', 'PENDING_OCCUPIED')], 1)
    with pytest.raises(OperationError, match='Fresh'):
        floor.action('T1', 'clean')


def test_outages_disable_recommendations_and_estimates(floor):
    make_ready(floor)
    floor.add_party('A', 2)
    snapshot = floor.snapshot('RECONNECTING', 'ready')
    assert snapshot['recommendations'] == []
    assert snapshot['wait_estimates'] == {}


def test_wait_schedules_do_not_reuse_same_table_simultaneously(floor):
    make_ready(floor)
    a = floor.add_party('A', 6)
    b = floor.add_party('B', 6)
    estimates = floor.estimates()
    assert estimates[a['id']]['min_minutes'] == 0
    assert estimates[b['id']]['min_minutes'] == 32
    assert estimates[b['id']]['max_minutes'] == 65


def test_unknown_occupancy_duration_is_not_predicted(floor):
    floor.observe('demo', [observation('T3', 'OCCUPIED')], 1)
    party = floor.add_party('A', 6)
    assert floor.estimates()[party['id']]['min_minutes'] is None


def test_persistence_and_restart_invalidate_visual_freshness(floor):
    make_ready(floor)
    party = floor.add_party('A', 2)
    path = floor.db.execute('PRAGMA database_list').fetchone()[2]
    restored = Operations(__import__('pathlib').Path(path))
    assert restored.state['parties'][0]['id'] == party['id']
    assert restored.recommendations() == []
    restored.close()


def test_new_video_or_explicit_reset_clears_old_parties(floor):
    floor.add_party('A', 2)
    session = floor.state['session_id']
    floor.configure('demo', [], reset=True)
    assert floor.state['parties'] == []
    assert floor.state['session_id'] != session


def test_cancelled_party_cannot_be_seated(floor):
    make_ready(floor)
    party = floor.add_party('A', 2)
    floor.cancel(party['id'])
    with pytest.raises(OperationError):
        floor.seat(party['id'], 'T1', floor.state['version'])


def test_assumption_changes_recalculate_queue_ranges(floor):
    make_ready(floor)
    floor.add_party('A', 6)
    party = floor.add_party('B', 6)
    floor.set_assumptions(dict(dining_min=10, dining_max=20, cleaning_min=1, cleaning_max=3))
    assert floor.estimates()[party['id']]['min_minutes'] == 11
    assert floor.estimates()[party['id']]['max_minutes'] == 23
    with pytest.raises(OperationError):
        floor.set_assumptions(dict(dining_min=30, dining_max=10, cleaning_min=1, cleaning_max=3))


def test_configuration_cannot_orphan_or_overfill_seated_party(floor):
    make_ready(floor)
    party = floor.add_party('Four', 4)
    floor.seat(party['id'], 'T2', floor.state['version'])
    before = floor.snapshot()
    remaining = [TableDef(id='T1', name='Small', capacity=2, polygon=[(0,0),(10,0),(10,10)])]
    with pytest.raises(OperationError, match='removing'):
        floor.configure('demo', remaining)
    assert floor.snapshot() == before
    too_small = remaining + [TableDef(id='T2', name='Reduced', capacity=2, polygon=[(0,0),(10,0),(10,10)])]
    with pytest.raises(OperationError, match='capacity'):
        floor.configure('demo', too_small)
    assert floor.snapshot() == before


def test_changed_region_requires_new_staff_verification(floor):
    make_ready(floor)
    changed = [TableDef(id=f'T{i}', name=f'Table {i}', capacity=capacity,
        polygon=[(20,20),(30,20),(30,30)] if i == 1 else [(0,0),(10,0),(10,10)])
        for i, capacity in enumerate([2,4,6], 1)]
    floor.configure('demo', changed)
    assert floor.table('T1')['status'] == 'needs_verification'
    assert floor.table('T2')['status'] == 'ready'
    floor.observe('demo', [observation('T1', 'OCCUPIED')], 1)
    assert floor.table('T1')['status'] == 'needs_verification'
    floor.observe('demo', [observation('T1', 'AVAILABLE')], 10)
    floor.action('T1', 'clean')
    assert floor.table('T1')['status'] == 'ready'


def test_manager_can_override_best_fit_but_not_capacity_or_readiness(floor):
    make_ready(floor)
    small = floor.add_party('Pair', 2)
    floor.seat(small['id'], 'T2', floor.state['version'], override=True)
    assert floor.table('T2')['party_id'] == small['id']
    assert floor.state['events'][0]['text'].startswith('Manager override:')
    large = floor.add_party('Six', 6)
    with pytest.raises(OperationError, match='eligible'):
        floor.seat(large['id'], 'T1', floor.state['version'], override=True)
    with pytest.raises(OperationError, match='eligible'):
        floor.seat(large['id'], 'T2', floor.state['version'], override=True)


def test_declining_keeps_party_waiting_and_excludes_this_table(floor):
    make_ready(floor)
    party = floor.add_party('Pair', 2)
    floor.decline(party['id'], 'T1', floor.state['version'])
    assert floor.state['parties'][0]['status'] == 'waiting'
    assert floor.recommendations()[0]['table_id'] == 'T2'
    assert 'declined' in floor.recommendations()[0]['explanation']
    floor.action('T1', 'hold_occupied')
    floor.action('T1', 'depart')
    floor.action('T1', 'clean')
    assert floor.recommendations()[0]['table_id'] == 'T1'


def test_staff_departure_is_not_undone_by_existing_presence(floor):
    floor.observe('demo', [observation('T1', 'OCCUPIED')], 1)
    floor.action('T1', 'depart')
    floor.observe('demo', [observation('T1', 'OCCUPIED')], 2)
    assert floor.table('T1')['status'] == 'cleaning_required'
    floor.observe('demo', [observation('T1', 'AVAILABLE')], 12)
    floor.action('T1', 'clean')
    floor.observe('demo', [observation('T1', 'OCCUPIED')], 20)
    assert floor.table('T1')['status'] == 'occupied'


def test_wait_range_spans_different_assignments_without_inversion(floor):
    floor.state['now'] = 3600
    floor.state['assumptions'] = dict(dining_min=15,dining_max=60,cleaning_min=1,cleaning_max=5)
    floor.state['tables'] = [dict(id=str(i), capacity=capacity, status=status, observed='absent',
        manual_hold=False, duration_known=True, occupied_since=started) for i, (capacity,status,started) in enumerate([
            (4,'cleaning_required',3526), (6,'cleaning_required',3002),
            (2,'occupied',516), (4,'occupied',1831)])]
    floor.state['parties'] = [dict(id=str(i),size=size,status='waiting') for i,size in enumerate([2,2,6,4,4,2])]
    estimate = floor.estimates()['5']
    assert estimate['scenario_minutes'] == dict(short_durations=17, long_durations=14)
    assert (estimate['min_minutes'], estimate['max_minutes']) == (14, 17)
    assert 'not a guaranteed bound' in estimate['note']


def test_concurrent_approvals_cannot_double_seat_a_table(floor):
    from concurrent.futures import ThreadPoolExecutor
    make_ready(floor)
    parties = [floor.add_party('A', 2), floor.add_party('B', 2)]
    version = floor.state['version']
    def approve(party):
        try:
            floor.seat(party['id'], 'T1', version, override=True)
            return 'seated'
        except OperationError:
            return 'rejected'
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(approve, parties))
    assert sorted(outcomes) == ['rejected', 'seated']
    assert sum(p['status'] == 'seated' for p in floor.state['parties']) == 1


def test_cleaning_priority_serves_demand_then_oldest_task(floor):
    for at, table_id in [(0,'T2'), (5,'T1'), (10,'T3')]:
        floor.state['now'] = at
        floor.action(table_id, 'hold_occupied')
        floor.action(table_id, 'depart')
    floor.add_party('Six guests', 6)
    tasks = floor.snapshot()['cleaning_priorities']
    assert [task['table_id'] for task in tasks] == ['T3','T2','T1']
    assert '1 waiting parties' in tasks[0]['explanation']
