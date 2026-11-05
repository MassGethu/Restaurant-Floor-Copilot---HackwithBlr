import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  Check,
  Download,
  Play,
  Users,
  Clock3,
  ArrowRight,
} from "lucide-react";
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
const tabs = [
  ["staff", "Staff desk"],
  ["arrivals", "Arrivals"],
  ["availability", "Availability"],
  ["simulation", "What-if lab"],
  ["analytics", "Analytics"],
  ["policy", "Policies"],
];

export default function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "staff";
  const [state, setState] = useState<FloorState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState("all");
  const [sound, setSound] = useState(false);
  const [notice, setNotice] = useState("");
  const known = useRef<Set<string> | null>(null);
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
  const [simParty, setSimParty] = useState("");
  const [simTable, setSimTable] = useState("");
  const [delay, setDelay] = useState(0);
  const [horizon, setHorizon] = useState(120);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const load = useCallback(async () => {
    try {
      const value = await floorRequest();
      if (!value.policy) {
        setError(
          "Restart the backend to load the expanded operations workspace.",
        );
        return;
      }
      setState(value);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [load]);
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
      (t) => known.current && !known.current.has(t.id),
    );
    if (fresh.length) {
      setNotice(
        `${fresh.length} new staff task${fresh.length === 1 ? "" : "s"} require attention.`,
      );
      if (sound) {
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
      }
    }
    known.current = new Set(tasks.map((t) => t.id));
  }, [state, sound]);
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setError("");
    try {
      setState(await floorRequest(path, body));
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
  const tasks = state.tasks ?? [];
  const arrivals = (state.arrivals ?? []).filter((a) => a.status === "pending");
  const waiting = state.parties.filter((p) => p.status === "waiting");
  const selectedParty = waiting.find((p) => p.id === simParty) ?? waiting[0];
  const choices = state.tables.filter(
    (t) =>
      t.status === "ready" &&
      (t.observed === "absent" || t.manual_hold) &&
      t.capacity >= (selectedParty?.size ?? Infinity),
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
      <div className="ops-heading">
        <div>
          <div className="eyebrow">FLOOR COPILOT / OPERATIONS WORKSPACE</div>
          <h1>Coordinate the next move.</h1>
          <p>Staff work, arrivals, availability and measurable decisions.</p>
        </div>
        <Link className="floor-btn" to="/floor">
          Back to floor <ArrowRight size={14} />
        </Link>
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
      <nav className="ops-tabs" aria-label="Operations sections">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setParams({ tab: id })}
          >
            {label}
            {id === "staff" && tasks.some((t) => active(t.status))
              ? ` (${tasks.filter((t) => active(t.status)).length})`
              : id === "arrivals" && arrivals.length
                ? ` (${arrivals.length})`
                : ""}
          </button>
        ))}
      </nav>
      {tab === "staff" && (
        <>
          <section className="ops-card">
            <div className="ops-section-heading">
              <h2>
                <Bell size={18} />
                Central staff alerts
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
            <p>
              Cleaning tasks follow confirmed departures. Check-in suggestions
              use elapsed time since recorded staff attention; they do not infer
              customer intent.
            </p>
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
                      <span>{task.status.replace("_", " ")}</span>
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
          <section className="ops-card">
            <h2>
              <Users size={18} />
              Staff roster
            </h2>
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
            <p>
              Role views coordinate work in one local dashboard; this prototype
              does not implement staff accounts or access control.
            </p>
          </section>
          <section className="ops-card">
            <h2>Request a service visit</h2>
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
                    {t.name} · request assistance
                  </button>
                ))}
            </div>
          </section>
        </>
      )}
      {tab === "arrivals" && (
        <section className="ops-card">
          <h2>Entrance observations</h2>
          <p>
            In <Link to="/setup">Table Setup</Link>, draw an entrance region and
            change its region type to “Entrance crossing zone”. A tracked person
            crossing from outside to inside generates a review candidate. People
            first seen inside are not automatically counted as arrivals. Nearby
            crossings are grouped for review, not assumed to be one party.
          </p>
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
            Estimated table availability
          </h2>
          <p>
            Ranges combine the configured dining and cleaning assumptions.
            Unknown or overdue dining sessions require a staff estimate.
            Availability does not authorize seating without cleaning
            confirmation.
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Seats</th>
                  <th>Additional time</th>
                  <th>Basis</th>
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
          <h2>What if we choose differently?</h2>
          <p>
            Compare the current allocation policy with seating a selected party
            at another ready table, now or after a deliberate delay. This is a
            deterministic forecast under explicit assumptions and does not
            change live state.
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
              <h2>Observed floor trend</h2>
              <a className="floor-btn" href={apiUrl("/api/copilot/export")}>
                <Download size={14} />
                Export party CSV
              </a>
            </div>
            <p>
              Sampled counts by scenario minute, updated by actual observations
              and staff actions. These are not historical training data or
              averaged occupancy rates.
            </p>
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
            <h2>Completed table sessions</h2>
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
          <section className="ops-card">
            <h2>Previous playback sessions</h2>
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
                Completed playback snapshots will appear after a restart or
                video switch.
              </p>
            )}
          </section>
        </>
      )}
      {tab === "policy" && (
        <section className="ops-card">
          <h2>Allocation and service policies</h2>
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
                <option value="fairness">Oldest feasible + best fit</option>
                <option value="balanced">Balanced matching</option>
                <option value="throughput">Guest throughput matching</option>
              </select>
            </label>
            <label>
              Protect overdue parties after (min)
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
              Suggest check-in after (min)
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
              Apply policies
            </button>
          </form>
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
        </section>
      )}
    </div>
  );
}
