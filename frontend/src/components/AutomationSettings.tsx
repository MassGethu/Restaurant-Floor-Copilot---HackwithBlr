import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Save } from "lucide-react";
import { useFloor } from "../hooks/useFloor";
import "../autonomy.css";

export default function AutomationSettings() {
  const { state, connected, busy, error, act } = useFloor();
  const [ackTimeout, setAckTimeout] = useState(45);
  const [departure, setDeparture] = useState(12);
  const [taskTimeout, setTaskTimeout] = useState(180);
  const [arrivalTimeout, setArrivalTimeout] = useState(90);
  const [workload, setWorkload] = useState(3);
  const [notice, setNotice] = useState("");
  const saved = state?.automation;
  useEffect(() => {
    if (!saved) return;
    setAckTimeout(saved.acknowledgement_timeout_seconds ?? 45);
    setDeparture(saved.departure_seconds);
    setTaskTimeout(saved.task_timeout_seconds);
    setArrivalTimeout(saved.seating_timeout_seconds);
    setWorkload(saved.max_tasks_per_staff);
  }, [
    saved?.acknowledgement_timeout_seconds,
    saved?.departure_seconds,
    saved?.task_timeout_seconds,
    saved?.seating_timeout_seconds,
    saved?.max_tasks_per_staff,
  ]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    if (
      await act("/automation", {
        acknowledgement_timeout_seconds: ackTimeout,
        departure_seconds: departure,
        task_timeout_seconds: taskTimeout,
        seating_timeout_seconds: arrivalTimeout,
        max_tasks_per_staff: workload,
      })
    )
      setNotice("Service policy saved.");
  };
  return (
    <section
      className="auto-panel auto-settings"
      aria-labelledby="auto-settings-title"
    >
      <header>
        <h2 id="auto-settings-title">Autonomous service policy</h2>
        <Link to="/autonomy">
          Service overview <ArrowRight size={13} />
        </Link>
      </header>
      <div className="auto-settings-body">
        <p>
          Set the operating boundaries once. The manager is called when evidence
          is uncertain, work is overdue, or a party needs an exception.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <div className="auto-settings-grid">
            <label>
              Acknowledgement deadline (seconds)
              <input
                type="number"
                min={10}
                max={600}
                required
                value={ackTimeout}
                onChange={(e) => setAckTimeout(Number(e.target.value))}
              />
              <small>
                Reassign an unanswered job automatically; alert only when nobody
                else can take it.
              </small>
            </label>
            <label>
              Vacancy confirmation (seconds)
              <input
                type="number"
                min={5}
                max={120}
                required
                value={departure}
                onChange={(e) => setDeparture(Number(e.target.value))}
              />
              <small>
                Additional sustained vacancy after the vision model’s departure
                threshold.
              </small>
            </label>
            <label>
              Staff task escalation (seconds)
              <input
                type="number"
                min={30}
                max={1800}
                required
                value={taskTimeout}
                onChange={(e) => setTaskTimeout(Number(e.target.value))}
              />
              <small>
                Raise priority for slow work. Staffing alerts appear only when
                no eligible person can take the job.
              </small>
            </label>
            <label>
              Guest arrival check (seconds)
              <input
                type="number"
                min={30}
                max={600}
                required
                value={arrivalTimeout}
                onChange={(e) => setArrivalTimeout(Number(e.target.value))}
              />
              <small>
                Hold the reservation and escalate if nobody confirms arrival.
              </small>
            </label>
            <label>
              Open jobs per team member
              <input
                type="number"
                min={1}
                max={10}
                required
                value={workload}
                onChange={(e) => setWorkload(Number(e.target.value))}
              />
              <small>Queue extra jobs until matching staff have room.</small>
            </label>
          </div>
          <button className="floor-btn primary" disabled={!connected || busy}>
            <Save size={14} />
            Save service policy
          </button>
        </form>
        {error && (
          <p className="auto-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="auto-saved" role="status">
            {notice}
          </p>
        )}
        <div className="auto-settings-mode">
          <div>
            <strong>
              {saved?.enabled
                ? "Automatic operation enabled"
                : "Manual operation enabled"}
            </strong>
            <p>
              {saved?.enabled
                ? "Use Pause in the overview for a temporary takeover. Manual operation restores individual seating controls."
                : "The floor shows seating choices for staff to apply. Enable automation to resume service without routine approvals."}
            </p>
          </div>
          <button
            className="floor-btn"
            disabled={!connected || busy || !saved}
            onClick={() =>
              void act("/automation", {
                enabled: !saved?.enabled,
                paused: false,
              })
            }
          >
            {saved?.enabled
              ? "Switch to manual operation"
              : "Enable autonomous service"}
          </button>
        </div>
        <div className="auto-settings-links">
          <Link to="/welcome">
            Print guest check-in QR <ArrowRight size={13} />
          </Link>
          <Link to="/check-in">
            Open guest check-in <ArrowRight size={13} />
          </Link>
          <Link to="/staff">
            Open staff workspace <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
