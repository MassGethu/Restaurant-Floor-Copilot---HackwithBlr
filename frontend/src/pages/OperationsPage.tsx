import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Check, Download, Play, Users, Clock3 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { floorRequest, type FloorState } from "../api/copilot";
import { apiUrl } from "../api/client";
import { operationsView, operationsViews } from "../lib/workspaceNavigation";

type Schedule = {
  parties_seated: number;
  guests_seated: number;
  total_guest_wait_minutes: number;
  unused_seats: number;
  unseated: string[];
  excluded_tables: string[];
  seated: {
    party_id: string;
    name: string;
    table_id: string;
    wait_minutes: number;
  }[];
};
type Simulation = {
  horizon_minutes: number;
  state_version: number;
  note: string;
  baseline: { min: Schedule; max: Schedule };
  proposed: { min: Schedule; max: Schedule };
};
const active = (status: string) =>
  ["open", "acknowledged", "in_progress"].includes(status);
const minute = (value: number) =>
  `${Math.floor(value / 60)}:${Math.floor(value % 60)
    .toString()
    .padStart(2, "0")}`;
export default function OperationsPage() {
  const tab = operationsView(useLocation().search);
  const view = operationsViews[tab];
  const [state, setState] = useState<FloorState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState("all");
  const [sound, setSound] = useState(false);
  const [notice, setNotice] = useState("");
  const known = useRef<Set<string> | null>(null);
  const requestId = useRef(0);
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("waiter");
  const [arrivalForms, setArrivalForms] = useState<
    Record<string, { name: string; size: number }>
  >({});
  const [policy, setPolicy] = useState<FloorState["policy"]>({
    strategy: "fairness",
    max_wait_minutes: 15,
    check_in_minutes: 10,
  });
  const [assumptions, setAssumptions] = useState<FloorState["assumptions"]>({
    dining_min: 30,
    dining_max: 60,
    cleaning_min: 2,
    cleaning_max: 5,
  });
  const [simParty, setSimParty] = useState("");
  const [simTable, setSimTable] = useState("");
  const [delay, setDelay] = useState(0);
  const [horizon, setHorizon] = useState(120);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const value = await floorRequest();
      if (!value.policy) {
        setError(
          "Restart the backend to load the expanded operations workspace.",
        );
        return;
      }
      if (id === requestId.current) {
        setState(value);
        setConnected(true);
      }
    } catch {
      if (id === requestId.current) setConnected(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (state?.assumptions) setAssumptions(state.assumptions);
    // Re-sync only when the saved values change, not on every poll.
  }, [
    state?.assumptions?.dining_min,
    state?.assumptions?.dining_max,
    state?.assumptions?.cleaning_min,
    state?.assumptions?.cleaning_max,
  ]);
  useEffect(() => {
    if (state?.policy) setPolicy(state.policy);
  }, [
    state?.policy?.strategy,
    state?.policy?.max_wait_minutes,
    state?.policy?.check_in_minutes,
  ]);
  useEffect(() => {
    if (!state) return;
    const tasks = (state.tasks ?? []).filter((t) => active(t.status));
    const fresh = tasks.filter(
      (t) =>
        known.current &&
        !known.current.has(t.id) &&
        (role === "all" || t.role === role),
    );
    if (fresh.length) {
      setNotice(
        `${fresh.length} new staff task${fresh.length === 1 ? " requires" : "s require"} attention.`,
      );
      if (sound) {
        try {
          const context = new AudioContext();
          const tone = context.createOscillator();
          const gain = context.createGain();
          tone.connect(gain);
          gain.connect(context.destination);
          gain.gain.value = 0.05;
          tone.frequency.value = 660;
          tone.start();
          tone.stop(context.currentTime + 0.15);
          tone.onended = () => void context.close();
        } catch {
          setSound(false);
          setNotice(
            "New tasks require attention. Sound is unavailable in this browser.",
          );
        }
      }
    }
    known.current = new Set(tasks.map((t) => t.id));
  }, [state, sound, role]);
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setError("");
    ++requestId.current;
    try {
      const value = await floorRequest(path, body);
      ++requestId.current;
      setState(value);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!state)
    return (
      <div className="ops-loading">
        {error || "Connecting to the operations workspace…"}
      </div>
    );
  const tasks = [...(state.tasks ?? [])].sort(
    (a, b) => Number(b.priority === "high") - Number(a.priority === "high"),
  );
  const arrivals = (state.arrivals ?? []).filter((a) => a.status === "pending");
  const waiting = state.parties.filter((p) => p.status === "waiting");
  const selectedParty = waiting.find((p) => p.id === simParty) ?? waiting[0];
  const choices = state.tables.filter(
    (t) =>
      t.seating_eligible && t.capacity >= (selectedParty?.size ?? Infinity),
  );
  const chosenTable = choices.find((t) => t.id === simTable) ?? choices[0];
  const submitSimulation = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedParty || !chosenTable) return;
    setBusy(true);
    setError("");
    try {
      setSimulation(
        await floorRequest<Simulation>("/simulate", {
          party_id: selectedParty.id,
          table_id: chosenTable.id,
          delay_minutes: delay,
          horizon_minutes: horizon,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  };
  const analytics = state.analytics;
  return (
    <div className="ops-page">
      <div className="ops-heading workspace-intro">
        <div>
          <div className="eyebrow">Restaurant operations</div>
          <h1>{view.label}</h1>
          <p>{view.description}</p>
        </div>
      </div>
      {!connected && (
        <div className="floor-error" role="alert">
          Connection lost. Showing the last received state; actions may fail
          until reconnected.
        </div>
      )}
      {error && (
        <div className="floor-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="ops-notice" role="status">
          <Bell size={16} />
          {notice}
          <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
      {tab === "staff" && (
        <>
          <section className="ops-card">
            <div className="ops-section-heading">
              <h2>
                <Bell size={18} />
                Open work
              </h2>
              <label>
                <input
                  type="checkbox"
                  checked={sound}
                  onChange={(e) => setSound(e.target.checked)}
                />{" "}
                Sound for new tasks
              </label>
            </div>
<details className="ops-fineprint">
            <summary>How does this work?</summary>
            <p>
              Cleaning tasks appear when staff confirm guests have left.
              Check-in reminders are based on time since a waiter last visited
              the table; the app does not guess what guests want.
            </p>
          </details>
            <div className="ops-toolbar">
              <label>
                Role{" "}
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="all">All staff</option>
                  <option value="waiter">Waiters</option>
                  <option value="cleaner">Cleaners</option>
                </select>
              </label>
              <span>
                {tasks.filter((t) => active(t.status)).length} active ·{" "}
                {tasks.filter((t) => t.status === "completed").length} completed
              </span>
            </div>
            <div className="ops-task-grid">
              {tasks
                .filter(
                  (t) =>
                    active(t.status) && (role === "all" || t.role === role),
                )
                .map((task) => (
                  <article className={`ops-task ${task.kind}`} key={task.id}>
                    <header>
                      <b>
                        {state.tables.find((t) => t.id === task.table_id)
                          ?.name ?? task.table_id}
                      </b>
                      <span>
                        {task.priority === "high" ? "HIGH PRIORITY · " : ""}
                        {task.status.replace("_", " ")}
                      </span>
                    </header>
                    <h3>
                      {task.kind.replace("_", " ")} <small>{task.source}</small>
                    </h3>
                    <p>{task.note}</p>
                    <small>
                      Open for{" "}
                      {minute(Math.max(0, state.now - task.created_at))} ·{" "}
                      {task.role}
                    </small>
                    <label>
                      Assign to
                      <select
                        aria-label={`Assign task ${task.id}`}
                        value={task.assigned_to ?? ""}
                        onChange={(e) =>
                          void act(`/tasks/${task.id}`, {
                            action: "assign",
                            staff_id: e.target.value,
                          })
                        }
                      >
                        <option value="" disabled>
                          Unassigned
                        </option>
                        {state.staff
                          .filter((s) => s.role === task.role)
                          .map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="ops-actions">
                      {task.status === "open" && (
                        <button
                          className="floor-btn"
                          disabled={busy}
                          onClick={() =>
                            void act(`/tasks/${task.id}`, {
                              action: "acknowledge",
                            })
                          }
                        >
                          Acknowledge
                        </button>
                      )}
                      {task.status !== "in_progress" && (
                        <button
                          className="floor-btn"
                          disabled={busy}
                          onClick={() =>
                            void act(`/tasks/${task.id}`, { action: "start" })
                          }
                        >
                          <Play size={12} />
                          Start
                        </button>
                      )}
                      <button
                        className="floor-btn primary"
                        disabled={busy || !connected}
                        onClick={() =>
                          void act(`/tasks/${task.id}`, { action: "complete" })
                        }
                      >
                        <Check size={13} />
                        {task.kind === "cleaning"
                          ? "Confirm clean"
                          : "Record visit"}
                      </button>
                      {task.kind !== "cleaning" && (
                        <button
                          className="floor-btn"
                          disabled={busy}
                          onClick={() =>
                            void act(`/tasks/${task.id}`, { action: "cancel" })
                          }
                        >
                          Not needed
                        </button>
                      )}
                    </div>
                  </article>
                ))}
            </div>
            {!tasks.some(
              (t) => active(t.status) && (role === "all" || t.role === role),
            ) && (
              <div className="ops-empty">No active tasks for this role.</div>
            )}
          </section>
          <details className="ops-card ops-fold">
            <summary>
              <h2>
                <Users size={18} />
                Staff list
              </h2>
              <small>{state.staff?.length ?? 0} people · add or view staff</small>
            </summary>
            <div className="ops-roster">
              {state.staff?.map((s) => (
                <span key={s.id}>
                  <b>{s.name}</b> · {s.role}
                </span>
              ))}
            </div>
            <form
              className="ops-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act("/staff", { name: staffName, role: staffRole }).then(
                  (ok) => {
                    if (ok) setStaffName("");
                  },
                );
              }}
            >
              <label>
                Name
                <input
                  required
                  maxLength={60}
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                />
              </label>
              <label>
                Role
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                >
                  <option value="waiter">Waiter</option>
                  <option value="cleaner">Cleaner</option>
                  <option value="host">Host</option>
                </select>
              </label>
              <button className="floor-btn primary" disabled={busy}>
                Add staff member
              </button>
            </form>
            <small className="ops-muted">
              Prototype: no staff logins yet.
            </small>
          </details>
          <section className="ops-card">
            <h2>Send a waiter to a table</h2>
            <div className="ops-actions">
              {state.tables
                .filter((t) =>
                  ["occupied", "needs_verification"].includes(t.status),
                )
                .map((t) => (
                  <button
                    className="floor-btn"
                    disabled={busy}
                    key={t.id}
                    onClick={() =>
                      void act(`/tables/${t.id}/service`, {
                        note: "Manager requested a service visit.",
                      })
                    }
                  >
                    {t.name}
                  </button>
                ))}
            </div>
          </section>
        </>
      )}
      {tab === "arrivals" && (
        <section className="ops-card">
          <h2>People spotted at the door</h2>
          <p>
            When the camera sees someone walk in, they show up here. You decide
            whether to add them to the waiting list.
          </p>
          <details className="ops-fineprint">
            <summary>How does this work?</summary>
            <p>
              In <Link to="/setup">Draw tables</Link>, draw an area over the
              entrance and set its type to “Entrance crossing zone”. Someone
              walking from outside to inside creates a suggestion here. People
              who walk in together are grouped for you to check, not assumed to
              be one party.
            </p>
          </details>
          {arrivals.map((arrival) => {
            const form = arrivalForms[arrival.id] ?? {
              name: "",
              size: Math.min(20, arrival.observed_people),
            };
            return (
              <article className="ops-task" key={arrival.id}>
                <header>
                  <b>
                    {arrival.observed_people} tracked crossing
                    {arrival.observed_people === 1 ? "" : "s"}
                  </b>
                  <span>{minute(arrival.observed_at)}</span>
                </header>
                <p>{arrival.note}</p>
                <form
                  className="ops-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(`/arrivals/${arrival.id}`, {
                      action: "register",
                      ...form,
                    });
                  }}
                >
                  <label>
                    Party name
                    <input
                      value={form.name}
                      onChange={(e) =>
                        setArrivalForms((v) => ({
                          ...v,
                          [arrival.id]: { ...form, name: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Confirmed party size
                    <input
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={form.size}
                      onChange={(e) =>
                        setArrivalForms((v) => ({
                          ...v,
                          [arrival.id]: {
                            ...form,
                            size: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <button className="floor-btn primary" disabled={busy}>
                    Register confirmed party
                  </button>
                  <button
                    className="floor-btn"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(`/arrivals/${arrival.id}`, { action: "dismiss" })
                    }
                  >
                    Dismiss
                  </button>
                </form>
              </article>
            );
          })}
          {!arrivals.length && (
            <div className="ops-empty">
              No pending entrance candidates. Configure a region on suitable
              fixed-camera footage or register groups manually on the floor
              page.
            </div>
          )}
        </section>
      )}
      {tab === "availability" && (
        <section className="ops-card">
          <h2>
            <Clock3 size={18} />
            When will tables free up?
          </h2>
          <details className="ops-fineprint">
            <summary>How does this work?</summary>
            <p>
              Estimates use the meal and cleaning times set in Settings →
              Seating & wait times. If the app doesn’t know when guests sat
              down, staff need to estimate. A table still has to be marked
              clean before anyone is seated.
            </p>
          </details>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Seats</th>
                  <th>Free in</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {state.availability?.map((t) => (
                  <tr key={t.table_id}>
                    <td>{t.name}</td>
                    <td>{t.capacity}</td>
                    <td>
                      {t.min_minutes === null || t.max_minutes === null
                        ? "Unknown"
                        : `${Math.ceil(t.min_minutes)}–${Math.ceil(t.max_minutes)} min`}
                    </td>
                    <td>{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "simulation" && (
        <section className="ops-card">
          <h2>What if we seat them somewhere else?</h2>
          <p>
            Pick a waiting party and a table to see what would happen to
            everyone else. Nothing on the floor changes.
          </p>
          <form className="ops-form" onSubmit={(e) => void submitSimulation(e)}>
            <label>
              Waiting party
              <select
                value={selectedParty?.id ?? ""}
                onChange={(e) => setSimParty(e.target.value)}
              >
                <option value="" disabled>
                  Choose party
                </option>
                {waiting.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.size} guests
                  </option>
                ))}
              </select>
            </label>
            <label>
              Proposed table
              <select
                value={chosenTable?.id ?? ""}
                onChange={(e) => setSimTable(e.target.value)}
              >
                <option value="" disabled>
                  Choose ready table
                </option>
                {choices.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.capacity} seats
                  </option>
                ))}
              </select>
            </label>
            <label>
              Delay (minutes)
              <input
                type="number"
                min={0}
                max={120}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
            </label>
            <label>
              Horizon (minutes)
              <input
                type="number"
                min={1}
                max={240}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
              />
            </label>
            <button
              className="floor-btn primary"
              disabled={busy || !selectedParty || !chosenTable}
            >
              Compare scenarios
            </button>
          </form>
          {!selectedParty || !chosenTable ? (
            <p>Add a waiting party and confirm a suitable table ready first.</p>
          ) : null}
          {simulation && (
            <>
              <div className="ops-comparison">
                {(["baseline", "proposed"] as const).map((key) => (
                  <article key={key}>
                    <h3>
                      {key === "baseline"
                        ? "Current policy"
                        : "Proposed choice"}
                    </h3>
                    <b>
                      {Math.min(
                        simulation[key].min.guests_seated,
                        simulation[key].max.guests_seated,
                      )}
                      –
                      {Math.max(
                        simulation[key].min.guests_seated,
                        simulation[key].max.guests_seated,
                      )}{" "}
                      guests seated within {simulation.horizon_minutes} min
                    </b>
                    <p>
                      Guest-weighted additional wait:{" "}
                      {Math.min(
                        simulation[key].min.total_guest_wait_minutes,
                        simulation[key].max.total_guest_wait_minutes,
                      )}
                      –
                      {Math.max(
                        simulation[key].min.total_guest_wait_minutes,
                        simulation[key].max.total_guest_wait_minutes,
                      )}{" "}
                      guest-minutes
                    </p>
                    <p>
                      Unused seats across assignments:{" "}
                      {simulation[key].min.unused_seats} /{" "}
                      {simulation[key].max.unused_seats} (short / long
                      durations)
                    </p>
                    <p>
                      Still waiting under long durations:{" "}
                      {simulation[key].max.unseated.join(", ") || "None"}
                    </p>
                  </article>
                ))}
              </div>
              <p>{simulation.note}</p>
              <small>
                State version {simulation.state_version}
                {state.version !== simulation.state_version
                  ? " · Floor changed; run again for an updated comparison."
                  : ""}
              </small>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Party</th>
                      <th>Baseline wait (long)</th>
                      <th>Proposed wait (long)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waiting.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          {simulation.baseline.max.seated.find(
                            (s) => s.party_id === p.id,
                          )?.wait_minutes ?? "Beyond horizon / unknown"}
                        </td>
                        <td>
                          {simulation.proposed.max.seated.find(
                            (s) => s.party_id === p.id,
                          )?.wait_minutes ?? "Beyond horizon / unknown"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      {tab === "analytics" && analytics && (
        <>
          <div className="ops-metrics">
            {[
              ["Parties seated", analytics.parties_seated],
              ["Guests seated", analytics.guests_seated],
              [
                "Average wait",
                analytics.average_wait_minutes === null
                  ? "—"
                  : `${analytics.average_wait_minutes.toFixed(1)} min`,
              ],
              ["Tasks completed", analytics.tasks_completed],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </article>
            ))}
          </div>
          <section className="ops-card">
            <div className="ops-section-heading">
              <h2>The floor over time</h2>
              <a className="floor-btn" href={apiUrl("/api/copilot/export")}>
                <Download size={14} />
                Export party CSV
              </a>
            </div>
<details className="ops-fineprint">
            <summary>How does this work?</summary>
            <p>
              Counts are taken every minute from what the camera saw and what
              staff confirmed. They describe this service only, not long-term
              averages.
            </p>
          </details>
            <div style={{ height: 280, width: "100%" }}>
              <ResponsiveContainer>
                <LineChart data={analytics.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="minute"
                    label={{
                      value: "Scenario minute",
                      position: "insideBottom",
                      offset: -3,
                    }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="stepAfter"
                    dataKey="occupied"
                    stroke="#427a9a"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="ready"
                    stroke="#468e68"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="cleaning"
                    stroke="#c99b4f"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="waiting"
                    stroke="#9c78b9"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p>
              Occupied table capacity: {analytics.occupied_capacity}/
              {analytics.total_capacity} seats · longest current wait:{" "}
              {analytics.longest_wait_minutes.toFixed(1)} min · manager
              overrides: {analytics.manual_overrides}
            </p>
          </section>
          <section className="ops-card">
            <h2>Finished tables</h2>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Duration</th>
                    <th>Timing basis</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.completed_sessions.map((s, i) => (
                    <tr key={i}>
                      <td>{s.table_id}</td>
                      <td>{minute(s.duration_seconds)}</td>
                      <td>
                        {s.duration_known
                          ? "Confirmed start"
                          : "Observed duration only; true arrival unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!analytics.completed_sessions.length && (
              <p>No completed sessions recorded yet.</p>
            )}
          </section>
          <details className="ops-card ops-fold">
            <summary>
              <h2>Past demo runs</h2>
              <small>{analytics.history.length} saved</small>
            </summary>
            {analytics.history.map((s) => (
              <p key={s.session_id}>
                {s.video_id} · {minute(s.now)} observed ·{" "}
                {
                  s.parties.filter(
                    (p) => p.status === "seated" || p.status === "departed",
                  ).length
                }{" "}
                parties served
              </p>
            ))}
            {!analytics.history.length && (
              <p>
                Past runs appear here after you start the video over.
              </p>
            )}
          </details>
        </>
      )}
      {tab === "policy" && (
        <section className="ops-card">
          <h2>How the app picks who sits where</h2>
          <form
            className="ops-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act("/policy", policy);
            }}
          >
            <label>
              Seating strategy
              <select
                value={policy.strategy}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    strategy: e.target.value as typeof policy.strategy,
                  })
                }
              >
                <option value="fairness">Fairest: longest wait first (recommended)</option>
                <option value="balanced">Balanced: fairness and full tables</option>
                <option value="throughput">Busiest nights: seat the most guests</option>
              </select>
            </label>
            <label>
              Treat a party as overdue after (min)
              <input
                type="number"
                min={1}
                max={240}
                value={policy.max_wait_minutes}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    max_wait_minutes: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Remind waiters to check on tables after (min)
              <input
                type="number"
                min={1}
                max={120}
                value={policy.check_in_minutes}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    check_in_minutes: Number(e.target.value),
                  })
                }
              />
            </label>
            <button className="floor-btn primary" disabled={busy}>
              Save
            </button>
          </form>
          <details className="ops-fineprint">
            <summary>How are these scored?</summary>
          <p>
            Balanced score = 100 per party + 10 per guest + 2 per waiting minute
            − 3 per unused seat. Throughput score = 20 per party + 30 per guest
            + 1 per waiting minute − 1 per unused seat. Waiting-score minutes
            are capped at 60. Older overdue feasible parties receive priority
            protection.
          </p>
          <p>
            Matching searches up to 12 capacity-feasible parties and 8 ready
            tables. Above 8 ready tables the oldest-feasible policy is used.
            This bounded optimization is not a learned model or an optimal
            solution for an unlimited queue.
          </p>
          </details>
        </section>
      )}
      {tab === "policy" && (
        <section className="ops-card">
          <h2>
            <Clock3 size={18} />
            How long meals and cleaning usually take
          </h2>
          <p>
            Used to estimate how much longer each waiting party will wait.
          </p>
          <form
            className="ops-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act("/assumptions", assumptions);
            }}
          >
            {(
              [
                ["dining_min", "Shortest meal (min)"],
                ["dining_max", "Longest meal (min)"],
                ["cleaning_min", "Fastest clean (min)"],
                ["cleaning_max", "Slowest clean (min)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={1}
                  max={key.startsWith("dining") ? 240 : 60}
                  required
                  value={assumptions[key]}
                  onChange={(e) =>
                    setAssumptions((current) => ({
                      ...current,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
            <button className="floor-btn primary" disabled={busy}>
              Save
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
