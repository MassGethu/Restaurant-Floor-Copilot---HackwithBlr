import ServiceFloorOverview from "../components/ServiceFloorOverview";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Check,
  CircleAlert,
  ClipboardList,
  Clock3,
  Pause,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useFloor } from "../hooks/useFloor";
import { formatSpan } from "../lib/format";
import "../autonomy.css";

export default function AutonomyPage() {
  const { state, connected, busy, error, act } = useFloor();
  const [showResolved, setShowResolved] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({});
  const config = state?.automation;
  const active = state?.exceptions.filter((e) => e.status !== "resolved") ?? [];
  const incidents = showResolved ? (state?.exceptions ?? []) : active;
  const running = config?.enabled && !config.paused;
  const camera =
    state?.observations_fresh &&
    state.source_status === "LIVE" &&
    state.model_state === "ready" &&
    !state.staff_mode;
  const workerFresh =
    config?.last_tick_at != null &&
    Date.now() / 1000 - config.last_tick_at < 10;
  const healthy =
    connected && running && camera && workerFresh && !config?.last_error;
  const tasks =
    state?.tasks.filter((t) =>
      ["open", "acknowledged", "in_progress"].includes(t.status),
    ) ?? [];
  const seated =
    state?.parties.filter((p) => p.status === "seated").length ?? 0;
  return (
    <div className="autonomy-page">
      <header className="auto-heading">
        <div>
          <div className="eyebrow">
            <span className="intro-line" /> YOUR SERVICE WORKSPACE
          </div>
          <h1>Service, in motion.</h1>
          <p>
            A clear view of the room. A little more space to focus on your
            guests.
          </p>
          {state?.playback.is_file && (
            <small className="auto-source">
              Recorded footage
              {state.playback.paused ? " · paused" : " · replay running"}
            </small>
          )}
        </div>
        <div className="auto-controls">
          {active.length > 0 && (
            <a className="floor-btn primary" href="#exceptions-title">
              Review {active.length} exception{active.length === 1 ? "" : "s"}
              <ArrowRight aria-hidden="true" size={14} />
            </a>
          )}
          <span className={`auto-status ${healthy ? "healthy" : "held"}`}>
            <i />
            {!connected
              ? "Connecting"
              : !running
                ? "Automation paused"
                : !workerFresh
                  ? config?.last_tick_at
                    ? "Control loop unavailable"
                    : "Starting control loop"
                  : !camera
                    ? "Seating on hold"
                    : "Autonomous service"}
          </span>
          <button
            className="floor-btn"
            disabled={!connected || busy || !config}
            onClick={() =>
              void act(
                "/automation",
                config?.enabled
                  ? { paused: !config.paused }
                  : { enabled: true, paused: false },
              )
            }
          >
            {running ? (
              <Pause aria-hidden="true" size={15} />
            ) : (
              <Play aria-hidden="true" size={15} />
            )}
            {running ? "Pause automation" : "Resume automation"}
          </button>
        </div>
      </header>
      {error && (
        <p className="auto-error" role="alert">
          {error}
        </p>
      )}
      {!connected && (
        <p className="auto-error" role="status">
          The service connection is unavailable. These are the last received
          values; controls are disabled.
        </p>
      )}
      {connected && running && config?.last_tick_at && !workerFresh && (
        <p className="auto-error" role="alert">
          The controller has not reported a recent cycle. Automatic operation
          may be unavailable; pause service automation and inspect the backend
          before relying on new allocations.
        </p>
      )}
      <section className="auto-summary" aria-label="Service totals">
        {[
          {
            label: "Actions recorded",
            icon: Activity,
            value: config?.actions ?? 0,
            detail: "Actions recorded this service",
          },
          {
            label: "Needs attention",
            icon: CircleAlert,
            value: active.length,
            detail: active.length
              ? "Exceptions to review"
              : "No open exceptions",
          },
          {
            label: "Tables allocated",
            icon: Users,
            value: seated,
            detail: `${state?.parties.filter((p) => p.status === "waiting").length ?? 0} waiting for a table`,
          },
          {
            label: "Jobs assigned",
            icon: ClipboardList,
            value: tasks.filter((t) => t.assigned_to).length,
            detail: `${tasks.length} tasks in progress or queued`,
          },
        ].map((m) => (
          <div key={m.label}>
            <span>
              {m.label}
              <m.icon size={15} aria-hidden="true" />
            </span>
            <strong>{m.value}</strong>
            <small>{m.detail}</small>
          </div>
        ))}
      </section>
      <ServiceFloorOverview state={state} />
      <div className="auto-grid">
        <section
          className="auto-panel auto-incidents"
          aria-labelledby="exceptions-title"
        >
          <header>
            <h2 id="exceptions-title" tabIndex={-1}>
              <CircleAlert aria-hidden="true" size={18} />
              Exceptions <span>{active.length}</span>
            </h2>
            <button
              className="auto-text-button"
              onClick={() => setShowResolved(!showResolved)}
            >
              {showResolved ? "Open only" : "Include resolved"}
            </button>
          </header>
          {!incidents.length && (
            <div className="auto-clear">
              <ShieldCheck aria-hidden="true" size={37} />
              <h3>
                {state?.tables.length
                  ? "Nothing needs your intervention."
                  : "Your floor is ready to connect."}
              </h3>
              <p>
                {state?.tables.length
                  ? "Routine seating, staff dispatch, and table turnover are handled automatically."
                  : "Choose a camera source and configure tables. Staff receive the opening clean checks automatically."}
              </p>
              <Link to={state?.tables.length ? "/floor" : "/videos"}>
                {state?.tables.length ? "View the floor" : "Set up the floor"}
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </div>
          )}
          {incidents.map((e) => (
            <article
              className={`auto-incident ${e.severity} ${e.status}`}
              key={e.id}
            >
              <div className="auto-incident-top">
                <strong>{e.title}</strong>
                <span>
                  {e.status === "resolved"
                    ? "Resolved"
                    : e.status === "acknowledged"
                      ? "Being handled"
                      : e.severity === "critical"
                        ? "Service held"
                        : "Review"}
                </span>
              </div>
              <p>{e.detail}</p>
              <small>
                <Clock3 aria-hidden="true" size={12} />
                {formatSpan(Math.max(0, (state?.now ?? 0) - e.created_at))} ago
              </small>
              {e.status !== "resolved" && (
                <>
                  <div className="auto-incident-links">
                    {e.table_id && (
                      <Link to="/floor">
                        Inspect table{" "}
                        <ArrowRight aria-hidden="true" size={13} />
                      </Link>
                    )}
                    {e.task_id && (
                      <Link to="/staff">
                        Open staff tasks{" "}
                        <ArrowRight aria-hidden="true" size={13} />
                      </Link>
                    )}
                    {e.key === "camera" && (
                      <Link to="/floor">
                        Camera recovery{" "}
                        <ArrowRight aria-hidden="true" size={13} />
                      </Link>
                    )}
                    {e.party_id && (
                      <Link to="/floor#add-party">
                        Review party <ArrowRight aria-hidden="true" size={13} />
                      </Link>
                    )}
                  </div>
                  <label className="auto-note">
                    <span>Intervention note (optional)</span>
                    <input
                      value={note[e.id] ?? ""}
                      name={`intervention_${e.id}`}
                      autoComplete="off"
                      maxLength={240}
                      placeholder="What are you checking?"
                      onChange={(event) =>
                        setNote({ ...note, [e.id]: event.target.value })
                      }
                    />
                  </label>
                  <div className="auto-incident-actions">
                    <button
                      className="floor-btn"
                      disabled={
                        !connected || busy || e.status === "acknowledged"
                      }
                      onClick={() =>
                        void act(`/exceptions/${e.id}`, {
                          action: "acknowledge",
                          note: note[e.id] ?? "",
                        })
                      }
                    >
                      <Check aria-hidden="true" size={14} />
                      {e.status === "acknowledged"
                        ? "Acknowledged"
                        : "I’m handling this"}
                    </button>
                    <button
                      className="auto-text-button"
                      disabled={!connected || busy}
                      onClick={() =>
                        void act(`/exceptions/${e.id}`, {
                          action: "retry",
                          note: note[e.id] ?? "",
                        })
                      }
                    >
                      Recheck condition
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </section>
        <div className="auto-aside">
          <section className="auto-panel">
            <header>
              <h2>
                <Activity aria-hidden="true" size={18} />
                How service moves
              </h2>
            </header>
            <ol className="auto-loop">
              {[
                {
                  title: "Welcome",
                  detail: "Guests check themselves in.",
                  to: "/check-in",
                },
                {
                  title: "Allocate",
                  detail: "Best-fit seating with queue protection.",
                  to: "/floor",
                },
                {
                  title: "Dispatch",
                  detail: "Available staff receive the next job.",
                  to: "/staff",
                },
                {
                  title: "Verify",
                  detail: "Camera confirms arrivals and departures.",
                  to: "/live",
                },
                {
                  title: "Turn over",
                  detail: "Cleaner reports completion; seating resumes.",
                  to: "/staff",
                },
              ].map((step, i) => (
                <li key={step.title}>
                  <span>{i + 1}</span>
                  <Link to={step.to}>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          <section className="auto-panel">
            <header>
              <h2>
                <Users aria-hidden="true" size={18} />
                Team workload
              </h2>
              <Link to="/staff">
                Staff view <ArrowRight aria-hidden="true" size={13} />
              </Link>
            </header>
            <div className="auto-team">
              {state?.staff.map((person) => {
                const count = tasks.filter(
                  (t) => t.assigned_to === person.id,
                ).length;
                return (
                  <div key={person.id}>
                    <span>
                      <b>{person.name}</b>
                      <small>
                        {person.role}
                        {person.available === false
                          ? " · Unavailable"
                          : " · Available"}
                      </small>
                    </span>
                    <strong>
                      {count}
                      <small> / {config?.max_tasks_per_staff}</small>
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      <section
        className="auto-panel auto-history"
        aria-labelledby="activity-title"
      >
        <header>
          <h2 id="activity-title">
            <Activity aria-hidden="true" size={18} />
            What the system did
          </h2>
          <span>Recorded decisions and evidence</span>
        </header>
        {!state?.automation_log.length && (
          <p className="auto-muted">
            Automatic actions will appear here as service begins.
          </p>
        )}
        <ol>
          {state?.automation_log
            .slice(0, activityExpanded ? 30 : 8)
            .map((entry) => (
              <li key={entry.id}>
                <span className={`auto-event-dot ${entry.kind}`} />
                <div>
                  <strong>{entry.explanation}</strong>
                  {entry.evidence && <small>Recalled operating lesson</small>}
                </div>
                <time>
                  {formatSpan(Math.max(0, state.now - entry.scenario_time))} ago
                </time>
              </li>
            ))}
        </ol>
        {(state?.automation_log.length ?? 0) > 8 && (
          <button
            className="activity-expand"
            aria-expanded={activityExpanded}
            onClick={() => setActivityExpanded(!activityExpanded)}
          >
            {activityExpanded ? "Show recent activity" : "Show more activity"}
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        )}
      </section>
      <footer className="auto-footer">
        <span>
          Your team confirms physical work. Every automatic decision stays in
          the activity log.
        </span>
        <Link to="/settings">
          Service settings <ArrowRight aria-hidden="true" size={13} />
        </Link>
      </footer>
    </div>
  );
}
