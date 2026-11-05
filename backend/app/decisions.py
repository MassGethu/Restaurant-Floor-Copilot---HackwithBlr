"""Pure, deterministic allocation and comparisons on the current queue.

No future arrivals or departure predictions are assumed here. Comparisons
measure the immediate queue effect if staff choose a different ready table.
"""


def ready_tables(tables):
    return [table for table in tables if table['status'] == 'ready' and
            (table['observed'] == 'absent' or table['manual_hold'])]


def allocate(waiting, tables, declined):
    free = list(ready_tables(tables))
    result = []
    for party in waiting:
        candidates = sorted((table for table in free if table['capacity'] >= party['size'] and
                             [party['id'], table['id']] not in declined),
                            key=lambda table: (table['capacity'], table['id']))
        if candidates:
            chosen = candidates[0]
            result.append((party, chosen))
            free.remove(chosen)
    return result


def compare_tables(party, waiting, tables, declined, baseline):
    remaining_parties = [p for p in waiting if p['id'] != party['id']]
    baseline_others = {p['id'] for p, _ in baseline if p['id'] != party['id']}
    comparisons = []
    for table in sorted(ready_tables(tables), key=lambda t: (t['capacity'], t['id'])):
        if table['capacity'] < party['size']:
            continue
        remaining_tables = [t for t in tables if t['id'] != table['id']]
        alternative = allocate(remaining_parties, remaining_tables, declined)
        seated_others = {p['id'] for p, _ in alternative}
        comparisons.append(dict(table_id=table['id'], table_name=table['name'],
            capacity=table['capacity'], unused_seats=table['capacity'] - party['size'],
            other_parties_seatable_now=len(alternative),
            other_guests_seatable_now=sum(p['size'] for p, _ in alternative),
            displaced_party_names=[p['name'] for p in remaining_parties if p['id'] in baseline_others - seated_others]))
    return comparisons
