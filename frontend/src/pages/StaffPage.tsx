import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardList, Play } from "lucide-react";
import { useFloor } from "../hooks/useFloor";
import { formatSpan } from "../lib/format";
import "../autonomy.css";

export default function StaffPage() {
  const { state, connected, busy, error, act } = useFloor();
  const [personId, setPersonId] = useState(
    () => localStorage.getItem("floor-staff") ?? "",
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const jobs =
    state?.tasks.filter(
      (t) =>
        ["open", "acknowledged", "in_progress"].includes(t.status) &&
        (!personId || t.assigned_to === personId),
    ) ?? [];
  const labels: Record<string, string> = {
    cleaning: "Clean and prepare",
    seating: "Welcome and seat",
    service: "Guest assistance",
    check_in: "Visit the table",
  };
  return (
    <div className="autonomy-page">
      <header className="auto-heading">
        <div>
          <div className="eyebrow">STAFF WORKSPACE</div>
          <h1>Your next job.</h1>
          <p>
            Jobs arrive automatically. Report what you’ve done so the floor can
            keep moving.
          </p>
        </div>
        <Link className="floor-btn" to="/autonomy">
          Service overview <ArrowRight size={15} />
        </Link>
      </header>
      <div className="staff-filter">
        <label htmlFor="staff-person">Show jobs for</label>
        <select
          id="staff-person"
          value={personId}
          onChange={(e) => {
            setPersonId(e.target.value);
            localStorage.setItem("floor-staff", e.target.value);
          }}
        >
          <option value="">Whole team</option>
          {state?.staff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.role}
            </option>
          ))}
        </select>
        {personId && (
          <button
            className="floor-btn"
            disabled={busy || !connected}
            onClick={() =>
              void act(`/staff/${personId}/availability`, {
                available:
                  state?.staff.find((p) => p.id === personId)?.available ===
                  false,
              })
            }
          >
            {state?.staff.find((p) => p.id === personId)?.available === false
              ? "Mark me available"
              : "Mark me unavailable"}
          </button>
        )}
        <span className="auto-status healthy">{jobs.length} open jobs</span>
      </div>
      {error && (
        <p className="auto-error" role="alert">
          {error}
        </p>
      )}
      {!connected && (
        <p className="auto-error" role="status">
          Reconnecting to service. Task updates are disabled until the
          connection returns.
        </p>
      )}
      <section className="staff-jobs" aria-label="Assigned jobs">
        {jobs
          .sort(
            (a, b) =>
              Number(b.priority === "high") - Number(a.priority === "high") ||
              a.created_at - b.created_at,
          )
          .map((task) => {
            const table = state?.tables.find((t) => t.id === task.table_id);
            const person = state?.staff.find((p) => p.id === task.assigned_to);
            const canClean =
              table &&
              !table.party_id &&
              !table.blocked &&
              (state?.staff_mode ||
                (state?.observations_fresh &&
                  state.source_status === "LIVE" &&
                  state.model_state === "ready" &&
                  table.observed === "absent"));
            return (
              <article className="auto-panel staff-job" key={task.id}>
                <div className="auto-incident-top">
                  <span>
                    {task.priority === "high"
                      ? "High priority"
                      : task.status.replaceAll("_", " ")}
                  </span>
                  <small>
                    {formatSpan((state?.now ?? 0) - task.created_at)} waiting
                  </small>
                </div>
                <h2>
                  {labels[task.kind] ?? task.kind} ·{" "}
                  {table?.name ?? task.table_id}
                </h2>
                <p>{task.note}</p>
                <small>
                  {person
                    ? `Assigned to ${person.name}`
                    : "Waiting for an available team member"}
                </small>
                {task.kind === "cleaning" && !canClean && (
                  <p>
                    The table must be empty with fresh camera evidence, or
                    checked in staff mode, before completion.
                  </p>
                )}
                <footer>
                  {task.status === "open" && (
                    <button
                      className="floor-btn"
                      disabled={busy || !connected || !task.assigned_to}
                      onClick={() =>
                        void act(`/tasks/${task.id}`, {
                          assignment_revision: task.assignment_revision ?? 0,
                          assigned_staff_id: task.assigned_to,
                          action: "acknowledge",
                        })
                      }
                    >
                      <Check size={14} />
                      On my way
                    </button>
                  )}
                  {task.status !== "in_progress" && (
                    <button
                      className="floor-btn"
                      disabled={busy || !connected || !task.assigned_to}
                      onClick={() =>
                        void act(`/tasks/${task.id}`, {
                          assignment_revision: task.assignment_revision ?? 0,
                          assigned_staff_id: task.assigned_to,
                          action: "start",
                        })
                      }
                    >
                      <Play size={14} />
                      Start job
                    </button>
                  )}
                  <button
                    className="floor-btn primary"
                    disabled={
                      busy ||
                      !connected ||
                      !task.assigned_to ||
                      (task.kind === "cleaning" && !canClean)
                    }
                    onClick={() =>
                      void act(`/tasks/${task.id}`, {
                        assignment_revision: task.assignment_revision ?? 0,
                        assigned_staff_id: task.assigned_to,
                        action: "complete",
                      })
                    }
                  >
                    <Check size={15} />
                    {task.kind === "cleaning"
                      ? "Table is empty and clean"
                      : task.kind === "seating"
                        ? "Guests have arrived"
                        : "Job complete"}
                  </button>
                </footer>
                {task.problem ? (
                  <div className="staff-problem">
                    <p role="status">
                      <strong>Problem reported:</strong> {task.problem}
                    </p>
                    <button
                      className="floor-btn"
                      disabled={busy || !connected}
                      onClick={() =>
                        void act(`/tasks/${task.id}`, {
                          assignment_revision: task.assignment_revision ?? 0,
                          assigned_staff_id: task.assigned_to,
                          action: "resolve_problem",
                        })
                      }
                    >
                      Problem is resolved
                    </button>
                  </div>
                ) : (
                  <details className="staff-problem">
                    <summary>Report a problem with this job</summary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void act(`/tasks/${task.id}`, {
                          assignment_revision: task.assignment_revision ?? 0,
                          assigned_staff_id: task.assigned_to,
                          action: "report_problem",
                          note: problems[task.id] ?? "",
                        });
                      }}
                    >
                      <label className="auto-note">
                        <span>What needs the manager’s help?</span>
                        <input
                          required
                          name={`task_problem_${task.id}`}
                          autoComplete="off"
                          maxLength={240}
                          value={problems[task.id] ?? ""}
                          onChange={(event) =>
                            setProblems({
                              ...problems,
                              [task.id]: event.target.value,
                            })
                          }
                          placeholder="e.g. damaged chair or cleaning supplies missing"
                        />
                      </label>
                      <button
                        className="floor-btn"
                        disabled={busy || !connected}
                      >
                        Send problem to manager
                      </button>
                    </form>
                  </details>
                )}
              </article>
            );
          })}
      </section>
      {connected && !jobs.length && (
        <section className="auto-panel auto-clear">
          <ClipboardList size={35} />
          <h3>You’re all caught up.</h3>
          <p>The next job will appear here automatically.</p>
        </section>
      )}
      <footer className="auto-footer">
        <span>
          Confirm real work only. Cleaning completion makes a table eligible for
          automatic allocation.
        </span>
        <Link to="/operations">
          Roster and assignment tools <ArrowRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
