"""Persistent restaurant state. Vision supplies evidence; staff approve readiness.

All transitions and seating checks run under one lock and SQLite transaction.
The snapshot is small (one restaurant) and versioned to reject stale approvals.
Scenario time comes from footage; wall time is retained only in audit events.
"""
from __future__ import annotations

import copy
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


class Operations(ServiceMixin):
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=15)
        self.db.execute("CREATE TABLE IF NOT EXISTS floor_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
        row = self.db.execute("SELECT payload FROM floor_state WHERE id=1").fetchone()
        self.db.execute("CREATE TABLE IF NOT EXISTS floor_sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        self.state = json.loads(row[0]) if row else self.empty()
        defaults=self.empty()
        for key in ('tasks','staff','arrivals','policy','trend','completed_sessions','counters'):
            self.state.setdefault(key,defaults[key])
        self._entrance_tracks={}
        self._arrival_cooldowns={}
        # Persisted observations are never treated as fresh after a process restart.
        self.fresh = False
        self.source = "NO SOURCE"
        self.model = "loading"

    @staticmethod
    def empty():
        return dict(session_id=str(uuid.uuid4()), video_id=None, version=0, now=0.0,
                    tables=[], parties=[], events=[], declined=[], tasks=[], arrivals=[], trend=[], completed_sessions=[], counters=dict(manager_overrides=0),
                    staff=[dict(id='waiter-1',name='Waiter 1',role='waiter'),dict(id='cleaner-1',name='Cleaner 1',role='cleaner')],
                    policy=dict(strategy='fairness',max_wait_minutes=15,check_in_minutes=10), assumptions=dict(dining_min=30, dining_max=60, cleaning_min=2, cleaning_max=5))

    @staticmethod
    def fail(message):
        raise OperationError(message)

    def close(self):
        self.db.close()

    def save(self):
        self.reconcile_tasks()
        point=dict(minute=int(self.state['now']//60),occupied=sum(t['status']=='occupied' for t in self.state['tables']),
                   ready=sum(t['status']=='ready' for t in self.state['tables']),cleaning=sum(t['status']=='cleaning_required' for t in self.state['tables']),
                   waiting=sum(p['status']=='waiting' for p in self.state['parties']))
        if self.state['trend'] and self.state['trend'][-1]['minute']==point['minute']:self.state['trend'][-1]=point
        else:self.state['trend'].append(point)
        self.state['trend']=self.state['trend'][-720:]
        self.state['version'] += 1
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO floor_state VALUES (1, ?)", (json.dumps(self.state),))

    def event(self, text: str, origin: str):
        self.state['events'].insert(0, dict(id=str(uuid.uuid4()), text=text, origin=origin,
                                          scenario_time=self.state['now'], recorded_at=time.time()))
        del self.state['events'][100:]

    def configure(self, video_id, tables, reset=False):
        tables=[table for table in tables if getattr(table,'kind','table')=='table']
        with self.lock:
            if not reset and self.state['video_id'] == video_id:
                self.validate_configuration(tables)
            if reset or self.state['video_id'] != video_id:
                saved_settings={key:copy.deepcopy(self.state[key]) for key in ('policy','staff','assumptions')}
                if self.state['tables']:
                    with self.db:self.db.execute('INSERT OR REPLACE INTO floor_sessions VALUES (?,?)',(self.state['session_id'],json.dumps(self.state)))
                self.state = self.empty()
                self.state.update(saved_settings)
                self._entrance_tracks={}
                self._arrival_cooldowns={}
                self.state['video_id'] = video_id
                self.event('New playback session. Confirm initial table readiness.', 'system')
                self.fresh = False
            old = {t['id']: copy.deepcopy(t) for t in self.state['tables']}
            configured = []
            for table in tables:
                item = old.get(table.id, dict(id=table.id, status='needs_verification', observed='unknown',
                           occupied_since=None, duration_known=False, dirty_since=None,
                           party_id=None, manual_hold=False, grace_until=0, seen_present=False,
                           people_count=0, note='Initial cleanliness has not been confirmed.'))
                region = [list(point) for point in table.polygon]
                if item.get('region') is not None and item['region'] != region:
                    item.update(status='needs_verification', observed='unknown', manual_hold=False,
                                verification_hold=True, note='Table region changed. Staff must verify this table.')
                    self.fresh = False
                    self.event(f"{table.name}: region changed; staff verification required.", 'system')
                item.update(name=table.name, capacity=table.capacity, region=region)
                configured.append(item)
            if configured != self.state['tables'] or reset:
                self.state['tables'] = configured
                self.save()

    def validate_configuration(self, tables):
        """Validate before saving either configuration or operational state."""
        proposed = {table.id: table for table in tables if getattr(table,"kind","table")=="table"}
        for party in self.state['parties']:
            if party['status'] != 'seated':
                continue
            table = proposed.get(party['table_id'])
            if table is None:
                raise OperationError('Confirm departure before removing a table with a seated party.')
            if table.capacity < party['size']:
                raise OperationError('Table capacity cannot be smaller than its seated party.')

    def observe(self, video_id, states, now, fresh=True, observation_time=None):
        with self.lock:
            if video_id != self.state['video_id']:
                return
            self.fresh = fresh
            self.state['now'] = max(self.state['now'], now)
            changed = False
            by_id = {s.table_id: s for s in states}
            for table in self.state['tables']:
                state = by_id.get(table['id'])
                if state is None:
                    continue
                observed = {'AVAILABLE': 'absent', 'OCCUPIED': 'present',
                            'PENDING_OCCUPIED': 'pending_arrival', 'PENDING_AVAILABLE': 'pending_departure'}[state.status.value]
                table['people_count'] = state.people_count
                previous = table['observed']
                table['observed'] = observed
                if previous != observed:
                    changed = True
                if table['manual_hold'] or table.get('verification_hold', False):
                    continue
                if table.get('departure_hold', False):
                    if observed != 'absent':
                        continue
                    table['departure_hold'] = False
                    changed = True
                if observed == 'present':
                    if table['status'] != 'occupied':
                        was_ready = table['status'] == 'ready'
                        started = now
                        if observation_time is not None and getattr(state, 'occupied_since', None) is not None:
                            started = max(0.0, now - (observation_time - state.occupied_since))
                        table.update(status='occupied', occupied_since=started,
                                     duration_known=was_ready, seen_present=True,
                                     dirty_since=None, note='Sustained presence confirmed by vision.')
                        self.event(f"{table['name']}: occupied, confirmed by vision.", 'vision')
                        changed = True
                    elif not table['seen_present']:
                        table['seen_present'] = True
                        changed = True
                elif observed == 'absent' and table['status'] == 'occupied' and now >= table['grace_until']:
                    if table['seen_present']:
                        self.depart(table, 'vision')
                    else:
                        table.update(status='needs_verification', note='Seated party not observed after arrival grace period. Verify with staff.')
                        self.event(f"{table['name']}: seating needs verification.", 'vision')
                    changed = True
            if changed or self.reconcile_tasks() or not self.state['trend'] or int(now//60)!=self.state['trend'][-1]['minute']:
                self.save()

    def depart(self, table, origin):
        party = next((p for p in self.state['parties'] if p['id'] == table['party_id']), None)
        if table['occupied_since'] is not None:
            self.state['completed_sessions'].append(dict(table_id=table['id'],capacity=table['capacity'],started_at=table['occupied_since'],ended_at=self.state['now'],duration_seconds=max(0,self.state['now']-table['occupied_since']),duration_known=table['duration_known'],origin=origin))
        if party:
            party['status'] = 'departed'
            party['departed_at']=self.state['now']
        table.update(status='cleaning_required', dirty_since=self.state['now'], dirty_origin=origin, party_id=None,
                     occupied_since=None, duration_known=False, seen_present=False,
                     note='Departure confirmed. Staff must confirm cleaning.')
        self.event(f"{table['name']}: cleaning required.", origin)
        self.state['declined'] = [pair for pair in self.state.get('declined', []) if pair[1] != table['id']]

    def table(self, table_id):
        table = next((t for t in self.state['tables'] if t['id'] == table_id), None)
        if not table:
            raise OperationError('Table not found.')
        return table

    def add_party(self, name, size):
        with self.lock:
            if not self.state['video_id'] or not self.state['tables']:
                raise OperationError('Start footage and configure tables before adding a party.')
            if not 1 <= size <= 20:
                raise OperationError('Party size must be between 1 and 20.')
            if sum(p['status'] == 'waiting' for p in self.state['parties']) >= 100:
                raise OperationError('Queue is full.')
            party = dict(id=str(uuid.uuid4()), name=name.strip()[:60] or f"Party {len(self.state['parties']) + 1}",
                         size=size, arrived_at=self.state['now'], status='waiting', table_id=None)
            self.state['parties'].append(party)
            self.event(f"{party['name']} joined the queue ({size} guests).", 'staff')
            self.save()
            return copy.deepcopy(party)

    def cancel(self, party_id):
        with self.lock:
            party = next((p for p in self.state['parties'] if p['id'] == party_id), None)
            if not party or party['status'] != 'waiting':
                raise OperationError('Only waiting parties can be removed.')
            party['status'] = 'cancelled'
            self.event(f"{party['name']} left the queue.", 'staff')
            self.save()

    def set_assumptions(self, values):
        with self.lock:
            if not (1 <= values['dining_min'] <= values['dining_max'] <= 240 and
                    1 <= values['cleaning_min'] <= values['cleaning_max'] <= 60):
                raise OperationError('Use ordered dining ranges within 1–240 minutes and cleaning ranges within 1–60 minutes.')
            self.state['assumptions'] = dict(values)
            self.event('Staff updated dining and cleaning assumptions; wait ranges recalculated.', 'staff')
            self.save()

    def action(self, table_id, action):
        with self.lock:
            table = self.table(table_id)
            if action == 'clean':
                if table['status'] not in ('cleaning_required', 'needs_verification'):
                    raise OperationError('Only a dirty or unverified table can be confirmed clean.')
                if not self.fresh or table['observed'] != 'absent':
                    raise OperationError('Fresh confirmed absence is required. Use a staff override if vision is incorrect.')
                if table['party_id']:
                    raise OperationError('Resolve the seated party before confirming readiness.')
                table.update(status='ready', occupied_since=None, dirty_since=None, manual_hold=False, verification_hold=False,
                             note='Clean and ready, confirmed by staff.')
                self.state['declined'] = [pair for pair in self.state.get('declined', []) if pair[1] != table_id]
            elif action == 'depart':
                if table['status'] not in ('occupied', 'needs_verification'):
                    raise OperationError('This table has no occupied session to end.')
                self.depart(table, 'staff')
                table['manual_hold'] = False
                table['verification_hold'] = False
                table['departure_hold'] = table['observed'] != 'absent'
            elif action == 'hold_occupied':
                table.update(status='occupied', manual_hold=True, verification_hold=False, departure_hold=False, occupied_since=self.state['now'],
                             duration_known=False, note='Staff correction: occupied. Camera transitions held until released.')
            elif action == 'hold_ready':
                if table['party_id']:
                    raise OperationError('Confirm departure before overriding readiness.')
                table.update(status='ready', manual_hold=True, verification_hold=False, departure_hold=False, occupied_since=None, dirty_since=None,
                             note='Staff override: clean and ready. Camera transitions held until released.')
            elif action == 'release':
                table.update(manual_hold=False, status='needs_verification',
                             note='Staff override released. Verify readiness or occupancy.')
            else:
                raise OperationError('Unknown staff action.')
            self.event(f"{table['name']}: {table['note']}", 'staff')
            self.save()

    def recommendations(self):
        if not self.fresh or self.source != 'LIVE' or self.model != 'ready':
            return []
        result = []
        waiting = [p for p in self.state['parties'] if p['status'] == 'waiting']
        declined = self.state.get('declined', [])
        policy=self.state['policy']
        effective=policy if len([t for t in self.state['tables'] if t['status']=='ready'])<=8 else {**policy,'strategy':'fairness'}
        allocation = allocate(waiting, self.state['tables'], declined, effective, self.state['now'])
        for party, table in allocation:
            index = waiting.index(party)
            skipped = [p['name'] for p in waiting[:index] if p['id'] not in {r['party_id'] for r in result}]
            reason = f"{table['name']} is staff-confirmed ready and its {table['capacity']} seats fit {party['size']} guests. Smallest suitable table; oldest feasible party first."
            if effective['strategy']!='fairness':
                reason=f"{table['name']} fits {party['size']} guests with {table['capacity']-party['size']} unused seats. The {effective['strategy']} preset compares guest count, party count, elapsed wait and unused seats across up to 12 feasible parties and 8 ready tables; overdue parties are protected."
            if skipped and effective['strategy']=='fairness':
                reason += f" Earlier waiting parties have no eligible remaining table under capacity and staff decisions: {', '.join(skipped)}."
            if any(pair[0] == party['id'] for pair in self.state.get('declined', [])):
                reason += ' Previously declined table options are excluded until their next departure/cleaning cycle.'
            result.append(dict(party_id=party['id'], party_name=party['name'], table_id=table['id'],
                               table_name=table['name'], unused_seats=table['capacity']-party['size'],
                               explanation=reason, version=self.state['version'],
                               alternatives=compare_tables(party, waiting, self.state['tables'], declined, allocation, effective, self.state['now'])))
        return result

    def decline(self, party_id, table_id, version):
        with self.lock:
            if version != self.state['version']:
                raise OperationError('Restaurant state changed. Review the refreshed recommendation.')
            if not any(r['party_id'] == party_id and r['table_id'] == table_id for r in self.recommendations()):
                raise OperationError('This suggestion is no longer current.')
            self.state.setdefault('declined', []).append([party_id, table_id])
            party = next(p for p in self.state['parties'] if p['id'] == party_id)
            self.event(f"Staff declined {party['name']} at {self.table(table_id)['name']}; party remains waiting.", 'staff')
            self.save()

    def seat(self, party_id, table_id, version, override=False):
        with self.lock:
            if version != self.state['version']:
                raise OperationError('Restaurant state changed. Review the refreshed recommendation.')
            party = next((p for p in self.state['parties'] if p['id'] == party_id and p['status'] == 'waiting'), None)
            table = self.table(table_id)
            eligible = (self.fresh and self.source == 'LIVE' and self.model == 'ready' and party is not None
                        and table['status'] == 'ready' and (table['observed'] == 'absent' or table['manual_hold'])
                        and table['capacity'] >= party['size'])
            if not eligible:
                raise OperationError('The party or table is no longer eligible for seating.')
            if not override and not any(r['party_id'] == party_id and r['table_id'] == table_id for r in self.recommendations()):
                raise OperationError('This allocation is no longer eligible.')
            party.update(status='seated', table_id=table_id, seated_at=self.state['now'])
            if override:self.state['counters']['manager_overrides']+=1
            table.update(status='occupied', party_id=party_id, occupied_since=self.state['now'],
                         duration_known=True, grace_until=self.state['now']+30, seen_present=False,
                         manual_hold=False, note=f"{party['name']} seated by staff; awaiting visual confirmation.")
            prefix = 'Manager override: ' if override else ''
            self.event(f"{prefix}{party['name']} seated at {table['name']}.", 'staff')
            self.save()

    def estimates(self):
        assumptions = self.state['assumptions']
        now = self.state['now']
        # Two deterministic schedules; each table can be allocated only once at a time.
        schedules = []
        for bound in ('min', 'max'):
            slots = []
            for table in self.state['tables']:
                release = None
                if table['status'] == 'ready' and (table['observed'] == 'absent' or table['manual_hold']):
                    release = 0
                elif table['status'] == 'cleaning_required':
                    release = assumptions[f'cleaning_{bound}'] * 60
                elif table['status'] == 'occupied' and table['duration_known']:
                    elapsed = now - table['occupied_since']
                    if elapsed < assumptions['dining_max'] * 60:
                        release = max(0, assumptions[f'dining_{bound}'] * 60 - elapsed) + assumptions[f'cleaning_{bound}'] * 60
                if release is not None:
                    slots.append(dict(capacity=table['capacity'], at=release, id=table['id']))
            schedule = {}
            for party in (p for p in self.state['parties'] if p['status'] == 'waiting'):
                options = sorted((s for s in slots if s['capacity'] >= party['size'] and
                                  not (s['at'] == 0 and [party['id'], s['id']] in self.state.get('declined', []))),
                                 key=lambda s: (s['at'], s['capacity'], s['id']))
                if options:
                    slot = options[0]
                    schedule[party['id']] = math.ceil(slot['at']/60)
                    slot['at'] += (assumptions[f'dining_{bound}'] + assumptions[f'cleaning_{bound}']) * 60
            schedules.append(schedule)
        estimates = {}
        for party in (p for p in self.state['parties'] if p['status'] == 'waiting'):
            short, long = (schedule.get(party['id']) for schedule in schedules)
            # Assignment can change between scenarios, so longer dining does not
            # necessarily increase every individual party's wait. Show the envelope
            # of the two schedules, not incorrectly labeled ordered bounds.
            values = [value for value in (short, long) if value is not None]
            estimates[party['id']] = dict(min_minutes=min(values) if len(values) == 2 else None,
                max_minutes=max(values) if len(values) == 2 else None,
                scenario_minutes=dict(short_durations=short, long_durations=long),
                note='Range spans two duration scenarios with queue allocation and parallel cleaning. Allocations can differ; this is not a guaranteed bound. Unknown or overdue sessions are excluded.')
        return estimates

    def snapshot(self, source=None, model=None):
        with self.lock:
            if source is not None:
                self.source = source
            if model is not None:
                self.model = model
            result = copy.deepcopy(self.state)
            result['availability']=self.availability()
            result['analytics']=self.operational_analytics()
            result.update(source_status=self.source, model_state=self.model, observations_fresh=self.fresh,
                          recommendations=self.recommendations(), wait_estimates=self.estimates() if self.fresh and self.source == 'LIVE' and self.model == 'ready' else {})
            waiting = [p for p in self.state['parties'] if p['status'] == 'waiting']
            dirty = [t for t in self.state['tables'] if t['status'] == 'cleaning_required']
            result['cleaning_priorities'] = [dict(table_id=t['id'], table_name=t['name'],
                explanation=(f"Can accommodate {sum(p['size'] <= t['capacity'] for p in waiting)} waiting parties; oldest cleaning task breaks ties."))
                for t in sorted(dirty, key=lambda t: (-sum(p['size'] <= t['capacity'] for p in waiting), t['dirty_since'], t['id']))]
            return result
