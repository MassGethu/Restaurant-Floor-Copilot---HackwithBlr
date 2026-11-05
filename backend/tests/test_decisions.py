"""Immediate allocation trade-offs, without assuming unobserved arrivals."""
import copy

from app.decisions import allocate, compare_tables


def test_smaller_table_preserves_large_party_seating_and_comparison_is_pure():
    parties = [dict(id='A', name='Pair', size=2), dict(id='B', name='Six guests', size=6)]
    tables = [dict(id='T1', name='Two seats', capacity=2, status='ready', observed='absent', manual_hold=False),
              dict(id='T2', name='Six seats', capacity=6, status='ready', observed='absent', manual_hold=False)]
    before = copy.deepcopy((parties, tables))
    baseline = allocate(parties, tables, [])
    assert [(party['id'], table['id']) for party, table in baseline] == [('A','T1'), ('B','T2')]
    comparisons = compare_tables(parties[0], parties, tables, [], baseline)
    small, large = comparisons
    assert small['other_parties_seatable_now'] == 1 and small['unused_seats'] == 0
    assert large['other_parties_seatable_now'] == 0 and large['unused_seats'] == 4
    assert large['displaced_party_names'] == ['Six guests']
    assert (parties, tables) == before


def test_comparisons_never_include_dirty_or_insufficient_tables():
    parties = [dict(id='A', name='Four', size=4)]
    tables = [dict(id='small', name='Small', capacity=2, status='ready', observed='absent', manual_hold=False),
              dict(id='dirty', name='Dirty', capacity=6, status='cleaning_required', observed='absent', manual_hold=False)]
    assert compare_tables(parties[0], parties, tables, [], []) == []
