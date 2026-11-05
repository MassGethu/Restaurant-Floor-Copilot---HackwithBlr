import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Check, Clock3, LayoutGrid, Pause, Play, Plus, ScanLine, Sparkles, Users, Video, X } from 'lucide-react';
import { api, apiUrl } from '../api/client';
import { floorRequest, type FloorState, type FloorTable, type Recommendation } from '../api/copilot';
import type { Video as VideoItem } from '../api/types';

const statusLabels = { ready: 'Ready to seat', occupied: 'Occupied', cleaning_required: 'Needs cleaning', needs_verification: 'Verify table' };
const duration = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;

function SeatingSuggestion({ rec, index, state, busy, connected, act }: {
  rec: Recommendation; index: number; state: FloorState; busy: boolean; connected: boolean;
  act: (path: string, body?: unknown, method?: string) => Promise<boolean>;
}) {
  const [alternative, setAlternative] = useState('');
  const party = state.parties.find(p => p.id === rec.party_id);
  const options = state.tables.filter(t => t.status === 'ready' && (t.observed === 'absent' || t.manual_hold) && t.capacity >= (party?.size ?? Infinity));
  const selected = options.some(t => t.id === alternative) ? alternative : rec.table_id;
  const chosen = options.find(t => t.id === selected);
  const override = selected !== rec.table_id;
  const comparison = rec.alternatives?.find(t => t.table_id === selected);
  return <div className="decision-card"><div className="decision-number">{String(index + 1).padStart(2, '0')} <span>SEATING RECOMMENDATION</span></div>
    <h3>{rec.party_name}<ArrowRight size={18} />{rec.table_name}</h3><p>{rec.explanation}</p>
    {options.length > 1 && <label className="alternative-label">Manager table choice
      <select aria-label={`Table choice for ${rec.party_name}`} value={selected} onChange={e => setAlternative(e.target.value)}>{options.map(t => <option key={t.id} value={t.id}>{t.name} · {t.capacity} seats{t.id === rec.table_id ? ' · recommended' : ''}</option>)}</select>
    </label>}
    {comparison && <div className="choice-comparison"><b>Compare the current queue</b><span>{comparison.unused_seats} unused seats at this table · {comparison.other_parties_seatable_now} other parties ({comparison.other_guests_seatable_now} guests) can also be seated now.</span>
      {comparison.displaced_party_names.length > 0 && <strong>This choice removes the immediate seating option for: {comparison.displaced_party_names.join(', ')}.</strong>}
      <small>Uses current ready tables and queue only; future arrivals and departures are not predicted.</small></div>}
    {override && <p className="override-explanation">Staff choice: {chosen?.name} fits this party and leaves {(chosen?.capacity ?? 0) - (party?.size ?? 0)} unused seats. This overrides the allocation policy; other suggestions will be recalculated.</p>}
    <button className="floor-btn primary" disabled={busy || !connected} onClick={() => void act('/seat', { party_id: rec.party_id, table_id: selected, version: rec.version, override })}>{override ? 'Confirm manager choice' : 'Approve seating'} <ArrowRight size={15} /></button>
    <button className="decline-suggestion" disabled={busy || !connected} onClick={() => void act('/decline', { party_id: rec.party_id, table_id: rec.table_id, version: rec.version })}>Decline this table · keep party waiting</button>
  </div>;
}

export default function FloorPage() {
  const [state, setState] = useState<FloorState | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState('');
  const [size, setSize] = useState(2);
  const [assumptions, setAssumptions] = useState({ dining_min: 30, dining_max: 60, cleaning_min: 2, cleaning_max: 5 });
  const [staffTable, setStaffTable] = useState<string | null>(null);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try { const data = await floorRequest(); if (id === requestId.current) { setState(data); setConnected(true); } }
    catch { setConnected(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 1000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => { api.videos().then(items => { setVideos(items); setSelected(items.find(v => v.id.includes('controlled'))?.id ?? items[0]?.id ?? ''); }).catch(() => setError('Could not load footage. Check that the backend is running.')); }, []);
  const act = async (path: string, body?: unknown, method = 'POST') => {
    setBusy(true); setError(''); ++requestId.current;
    try { const data = await floorRequest(path, body, method); ++requestId.current; setState(data); setConnected(true); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); await refresh(); return false; }
    finally { setBusy(false); }
  };
  const addParty = async (e: FormEvent) => { e.preventDefault(); if (await act('/parties', { name, size })) setName(''); };
  const tables = state?.tables ?? [];
  const waiting = state?.parties.filter(p => p.status === 'waiting') ?? [];
  const ready = tables.filter(t => t.status === 'ready').length;
  const occupied = tables.filter(t => t.status === 'occupied').length;
  const dirty = tables.filter(t => t.status === 'cleaning_required').length;
  const live = connected && state?.source_status === 'LIVE' && state.model_state === 'ready' && state.observations_fresh;
  const now = state?.now ?? 0;
  const activeVideo = state?.playback.video_id;
  const currentVideo = videos.find(v => v.id === state?.video_id);
  const isControlled = state?.video_id?.includes('controlled');
  const tableAction = (table: FloorTable, action: string) => void act(`/tables/${encodeURIComponent(table.id)}`, { action });

  return <div className="floor-page">
    <div className="floor-heading"><div><div className="eyebrow">RESTAURANT OPERATIONS <span>/</span> FLOOR OVERVIEW</div><h1>Your floor, in focus<span>.</span></h1><p>See what’s happening. Know what to do next.</p></div>
      <div className={`live-pill ${live ? 'is-live' : ''}`}><i />{!connected ? 'Connecting to copilot' : state?.model_state === 'failed' ? 'Detection unavailable' : state?.model_state === 'loading' ? 'Loading vision model' : state?.playback.paused ? 'Playback paused' : live ? 'Vision is observing' : 'Awaiting footage'}</div></div>

    {state && tables.length > 0 && !live && <div className="floor-stale" role="status">Last known floor state. {state.model_state === 'failed' ? 'The detector is unavailable.' : !activeVideo ? 'Start footage to resume observation.' : state.playback.ended ? 'The clip has ended.' : 'Waiting for fresh inference.'} Seating suggestions are disabled until current observations are available.</div>}
    {error && <div className="floor-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}

    <div className="floor-metrics">
      {[{value: ready, label: 'Ready to seat', sub: 'Staff-confirmed clean', color: 'green'}, {value: occupied, label: 'Tables occupied', sub: `${tables.length ? Math.round(occupied / tables.length * 100) : 0}% of configured tables`, color: 'blue'}, {value: dirty, label: 'Awaiting cleaning', sub: dirty ? 'Preparation needed' : 'No cleaning tasks', color: 'amber'}, {value: waiting.length, label: 'Parties waiting', sub: `${waiting.reduce((sum, p) => sum + p.size, 0)} guests in queue`, color: 'purple'}].map(item => <div className={`floor-metric ${item.color}`} key={item.label}><div><span>{item.label}</span><b>{item.value.toString().padStart(2, '0')}</b><small>{item.sub}</small></div><div className="metric-mark">{item.color === 'purple' ? <Users size={20} /> : item.color === 'amber' ? <Sparkles size={20} /> : <LayoutGrid size={20} />}</div></div>)}
    </div>

    <div className="floor-main-grid"><div className="floor-left">
      <section className="floor-panel camera-panel"><div className="panel-title"><div><Video size={17} /><h2>Visual observation</h2></div><span className="mini-label">{(state?.playback.processing_fps ?? 0).toFixed(1)} detections / sec</span></div>
        <div className="camera-window">{activeVideo && state ? <img key={state.playback.session_id} src={apiUrl('/api/stream')} alt="Actual person detection with manually configured table regions" /> : <div className="camera-empty"><ScanLine size={42} strokeWidth={1} /><h3>Give your copilot a view</h3><p>Select a video below or upload footage to get started.</p><Link to="/videos">Manage footage <ArrowRight size={14} /></Link></div>}
          {activeVideo && state && <div className="camera-caption"><span><i />{isControlled ? 'CONTROLLED DEMO · EDITED STOCK FOOTAGE' : 'PRERECORDED FOOTAGE · ACTUAL INFERENCE'}</span><b>{duration(now)}</b></div>}</div>
        <div className="camera-controls"><select aria-label="Select footage" value={selected || state?.video_id || ''} onChange={e => setSelected(e.target.value)}><option value="" disabled>Select footage</option>{videos.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select><button className="floor-btn primary" disabled={busy || !(selected || state?.video_id)} onClick={() => void act('/play', { video_id: selected || state?.video_id })}><Play size={14} />{activeVideo ? 'Restart' : 'Start'}</button><button className="floor-btn" disabled={busy || !activeVideo || !state || state.playback.ended} onClick={() => void act('/pause', { paused: !state?.playback.paused })}>{state?.playback.paused ? <Play size={15} /> : <Pause size={15} />}{state?.playback.paused ? 'Resume' : 'Pause'}</button></div>
        <div className="camera-note">Restart begins a new scenario and clears queue and staff actions. Pausing freezes scenario timers.{state?.playback.ended && <strong> Clip ended. Restart to run again.</strong>}</div>
      </section>

      <section className="floor-panel"><div className="panel-title"><div><LayoutGrid size={17} /><h2>Restaurant floor</h2><span className="count-chip">{tables.length} tables</span></div><Link to={state?.video_id ? `/setup/${state.video_id}` : '/setup'}>Configure tables <ArrowRight size={13} /></Link></div>
        <div className="floor-legend"><span className="green">● Ready</span><span className="blue">● Occupied</span><span className="amber">● Cleaning</span><span>● Verify</span></div>
        {!tables.length ? <div className="floor-empty"><LayoutGrid size={26} /><p>Draw table regions and set seating capacities to begin.</p><Link to={state?.video_id ? `/setup/${state.video_id}` : '/setup'}>Open table setup →</Link></div> : <div className="table-grid">{tables.map(table => <article className={`floor-table ${table.status}`} key={table.id}>
          <div className="table-top"><span>{table.id}</span><b><Users size={12} />{table.capacity}</b></div><div className="table-symbol"><i /><i /><div>{table.name}</div><i /><i /></div>
          <span className="table-status">{statusLabels[table.status]}</span><div className="table-timer">{table.status === 'occupied' && table.occupied_since !== null ? <><Clock3 size={12} />{duration(now - table.occupied_since)}{!table.duration_known && ' observed'}</> : table.manual_hold ? 'Staff override active' : `Vision: ${table.observed.replaceAll('_', ' ')}`}</div>
          <div className="table-actions">{(table.status === 'cleaning_required' || table.status === 'needs_verification') && !table.manual_hold && <button disabled={busy || !connected} onClick={() => tableAction(table, 'clean')}><Check size={12} />Confirm clean</button>}<button onClick={() => setStaffTable(staffTable === table.id ? null : table.id)} aria-label={`Staff actions for ${table.name}`}>•••</button></div>
          {staffTable === table.id && <div className="staff-actions"><p>{table.note}</p>{table.status === 'occupied' || table.status === 'needs_verification' ? <button disabled={busy} onClick={() => tableAction(table, 'depart')}>Confirm departure</button> : null}<button disabled={busy} onClick={() => tableAction(table, 'hold_occupied')}>Override: occupied</button><button disabled={busy} onClick={() => tableAction(table, 'hold_ready')}>Override: clean & ready</button>{table.manual_hold && <button disabled={busy} onClick={() => tableAction(table, 'release')}>Release override</button>}</div>}
        </article>)}</div>}
      </section>
    </div>

    <aside className="floor-right"><section className="decision-panel"><div className="panel-title"><div><Sparkles size={18} /><h2>Next best move</h2></div><span className="rule-badge">EXPLAINED</span></div><p className="decision-intro">A recommendation you can act on.</p>
      {state?.recommendations.length ? state.recommendations.map((rec, index) => <SeatingSuggestion key={rec.party_id} rec={rec} index={index} state={state} busy={busy} connected={connected} act={act} />) : <div className="decision-empty"><div><Check size={24} /></div><h3>{!live ? 'Waiting for a clear view' : waiting.length ? 'Prepare a suitable table' : 'You’re all caught up'}</h3><p>{!live ? 'Recommendations appear after fresh detection and staff readiness confirmation.' : waiting.length ? 'No seating suggestion is eligible under current readiness, capacity and recorded staff decisions.' : 'Add an arriving party to receive an explained seating recommendation.'}</p></div>}
      <div className="policy-note"><ScanLine size={14} /><span>Pretrained vision observes. Explicit allocation rules recommend. You approve.</span></div></section>

      <section className="floor-panel cleaning-panel"><div className="panel-title"><div><Sparkles size={17} /><h2>Prepare next</h2></div><span className="count-chip">{dirty}</span></div>{state?.cleaning_priorities.length ? state.cleaning_priorities.map((task, i) => <div className="cleaning-task" key={task.table_id}><span>{i+1}</span><div><h3>{task.table_name}</h3><p>{task.explanation}</p></div><button aria-label={`Confirm ${task.table_name} clean`} disabled={busy || !connected} onClick={() => void act(`/tables/${task.table_id}`, { action: 'clean' })}><Check size={17} /></button></div>) : <div className="small-empty">No tables awaiting cleaning.</div>}</section>

      <section className="floor-panel assumptions"><div className="eyebrow">ESTIMATION ASSUMPTIONS</div><p>Dining <b>{state?.assumptions.dining_min ?? 30}–{state?.assumptions.dining_max ?? 60} min</b><br />Cleaning <b>{state?.assumptions.cleaning_min ?? 2}–{state?.assumptions.cleaning_max ?? 5} min</b></p><small>Heuristic ranges, including the queue ahead. Parallel cleaning assumed. Unknown and overdue sessions need staff input.</small>
        <details onToggle={e => { if (e.currentTarget.open && state) setAssumptions(state.assumptions); }}><summary>Edit assumptions</summary><form onSubmit={e => { e.preventDefault(); void act('/assumptions', assumptions); }}>
          {(['dining_min', 'dining_max', 'cleaning_min', 'cleaning_max'] as const).map(key => <label key={key}>{key.replace('_', ' ')}<input type="number" min={1} max={key.startsWith('dining') ? 240 : 60} required value={assumptions[key]} onChange={e => setAssumptions(current => ({ ...current, [key]: Number(e.target.value) }))} /></label>)}
          <button className="floor-btn" disabled={busy || !connected}>Apply ranges</button></form></details>
      </section>
    </aside></div>

    <section className="floor-panel queue-panel"><div className="panel-title"><div><Users size={17} /><h2>Waiting room</h2><span className="count-chip">{waiting.length} parties</span></div><span className="mini-label">Oldest feasible party first · smallest suitable table</span></div>
      <form className="party-form" onSubmit={e => void addParty(e)}><label>Party name<input placeholder="e.g. The Sharma party" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label><label>Guests<input aria-label="Party size" type="number" min={1} max={20} required value={size} onChange={e => setSize(Number(e.target.value))} /></label><button className="floor-btn primary" disabled={busy || !connected || !tables.length}><Plus size={15} />Add to queue</button></form>
      <div className="queue-scroll"><table className="queue-table"><thead><tr><th>PARTY</th><th>GUESTS</th><th>WAITING <ArrowDown size={11} /></th><th>ESTIMATED ADDITIONAL WAIT</th><th>NEXT STEP</th><th /></tr></thead><tbody>{waiting.map(party => {const rec = state?.recommendations.find(r => r.party_id === party.id); const estimate = state?.wait_estimates[party.id]; return <tr key={party.id}><td><span className="party-avatar">{party.name.slice(0,1).toUpperCase()}</span><b>{party.name}</b></td><td><Users size={13} /> {party.size}</td><td>{duration(now-party.arrived_at)}</td><td title={estimate?.note}>{estimate?.min_minutes !== null && estimate?.min_minutes !== undefined && estimate.max_minutes !== null ? `${estimate.min_minutes}–${estimate.max_minutes} min · heuristic` : 'Needs staff estimate'}</td><td>{rec ? <span className="queue-ready">Ready for {rec.table_name}</span> : <span className="queue-waiting">Waiting for a suitable table</span>}</td><td><button aria-label={`Remove ${party.name}`} disabled={busy} onClick={() => void act(`/parties/${party.id}`, undefined, 'DELETE')}><X size={15} /></button></td></tr>;})}</tbody></table>{!waiting.length && <div className="small-empty">Your queue is clear. Add the next arriving party above.</div>}</div>
    </section>

    <section className="floor-panel activity-panel"><div className="panel-title"><div><Clock3 size={17} /><h2>Floor activity</h2></div><span className="mini-label">Every decision leaves a trace</span></div><div className="activity-list">{state?.events.slice(0,8).map(event => <div key={event.id}><time>{duration(event.scenario_time)}</time><span className={`event-origin ${event.origin}`}>{event.origin}</span><p>{event.text}</p></div>)}{!state?.events.length && <div className="small-empty">Activity will appear as your floor changes.</div>}</div></section>
    <footer className="floor-footer"><span>FLOOR COPILOT <i /> Human judgment, better informed.</span><span>{currentVideo?.name ?? 'No active footage'} · Local processing</span></footer>
  </div>;
}
