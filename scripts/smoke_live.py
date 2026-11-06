"""Exercise the actual running YOLO application on the controlled input clip.

Requires backend on localhost:8001. Resets only this prototype's demo session.
The report distinguishes staff actions from vision-triggered transitions.
"""
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
report = []


def api(path='', body=None):
    request = Request('http://127.0.0.1:8001/api/copilot' + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json'})
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def wait(check, limit=100):
    deadline = time.monotonic() + limit
    while time.monotonic() < deadline:
        state = api()
        if check(state):
            return state
        time.sleep(.3)
    raise AssertionError('Timed out awaiting the specified inferred state')


def table(state, id):
    return next(t for t in state['tables'] if t['id'] == id)


def record(label, state):
    row = dict(check=label, scenario_time=state['now'], tables={t['id']:t['status'] for t in state['tables']},
               processing_fps=state['playback']['processing_fps'])
    report.append(row)
    print(json.dumps(row), flush=True)


try:
    api('/play', {'video_id':'controlled-floor-demo'})
    state = wait(lambda s: s['observations_fresh'] and all(t['observed']=='absent' for t in s['tables']))
    api('/pause', {'paused':True})
    time.sleep(.2)
    before = api()['now']
    time.sleep(.5)
    assert abs(api()['now'] - before) < .11, 'Scenario clock advanced while paused'
    for id in ('T1','T2','T3','T4'):
        state = api('/tables/'+id, {'action':'clean'})
    record('Initial cleanliness confirmed by staff; pause freezes media clock', state)
    state = api('/parties', {'name':'Test pair','size':2})
    rec = state['recommendations'][0]
    assert rec['table_id'] == 'T1'
    state = api('/seat', {k: rec[k] for k in ('party_id','table_id','version')})
    state = api('/parties', {'name':'Test group of four','size':4})
    rec = state['recommendations'][0]
    assert rec['table_id'] == 'T2'
    state = api('/seat', {k: rec[k] for k in ('party_id','table_id','version')})
    state = api('/tables/T3', {'action':'hold_occupied'})
    state = api('/tables/T4', {'action':'hold_occupied'})
    state = api('/parties', {'name':'Waiting pair','size':2})
    assert state['recommendations'] == []
    estimate = state['wait_estimates'][state['parties'][-1]['id']]
    assert estimate['min_minutes'] is not None and estimate['max_minutes'] >= estimate['min_minutes']
    record('Staff-approved seating, overflow queue and explicit heuristic estimate', state)
    api('/pause', {'paused':False})
    state = wait(lambda s: s['now'] >= 30 and table(s,'T1')['observed']=='present' and table(s,'T2')['observed']=='present', 45)
    assert table(state,'T1')['status']=='occupied' and table(state,'T2')['status']=='occupied'
    record('Actual YOLO inference confirms both seated regions', state)
    state = wait(lambda s: s['now'] >= 45, 25)
    assert table(state,'T1')['status']=='occupied'
    assert not any('cleaning required' in e['text'] and 'Table 1' in e['text'] for e in state['events'])
    record('Brief 40–42 second absence does not release the table', state)
    state = wait(lambda s: table(s,'T1')['status']=='cleaning_required', 40)
    record('Sustained visual absence triggers cleaning required', state)
    state = api('/tables/T1', {'action':'clean'})
    rec = next(r for r in state['recommendations'] if r['table_id']=='T1')
    state = api('/seat', {k:rec[k] for k in ('party_id','table_id','version')})
    assert table(state,'T1')['status']=='occupied'
    api('/pause', {'paused':True})
    record('Staff cleaning confirmation re-evaluates queue and enables seating', state)
    result = dict(passed=True, checks=report, footage='Explicitly synthetic edited stock montage; actual YOLO inference',
                  events=state['events'])
except Exception as error:
    result = dict(passed=False, checks=report, error=repr(error))
    raise
finally:
    (ROOT/'docs/verification/hindsight-live-smoke-report.json').write_text(json.dumps(result, indent=2))
