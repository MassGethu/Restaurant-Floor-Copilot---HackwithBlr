import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Brain, BookOpen, ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { floorRequest, type FloorState } from "../api/copilot";
import {
  supervisorRequest,
  type AdviceResult,
  type Experience,
  type Handover,
  type ShiftContext,
  type SupervisorState,
} from "../api/supervisor";
import { AdviceCards, EvidenceList } from "../components/SupervisorCards";

function ExperienceCard({
  item,
  activeLayout,
  changed,
}: {
  item: Experience;
  activeLayout: string;
  changed: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const historical =
    !item.active || item.layout_id !== activeLayout || !!item.superseded_by;
  const send = async (action: string, body: unknown) => {
    setBusy(true);
    setError("");
    try {
      await supervisorRequest(`/experiences/${item.id}/${action}`, body);
      setNote("");
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save feedback.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`experience-card ${historical ? "historical" : ""}`}>
      <header>
        <b>{item.kind.replaceAll("_", " ")}</b>
        <span className={`memory-status ${item.delivery}`}>
          {item.delivery}
        </span>
      </header>
      <small>
        {new Date(item.recorded_at).toLocaleString()} ·{" "}
        {item.source.replaceAll("_", " ")}
      </small>
      <p>
        {item.content.note ||
          (item.content.action
            ? `${item.content.accepted ? "Approved" : "Declined"}: ${item.content.action.reason}`
            : item.content.outcome?.replaceAll("_", " "))}
      </p>
      {item.content.baseline_table_id && (
        <p>
          Baseline {item.content.baseline_table_id} → reported alternative{" "}
          {item.content.chosen_table_id || "unspecified"}
        </p>
      )}
      {item.content.outcome && (
        <b>Outcome: {item.content.outcome.replaceAll("_", " ")}</b>
      )}
      <small>{item.content.qualification}</small>
      <p className="memory-id">
        {item.id}
        {item.parent_id ? ` · relates to ${item.parent_id}` : ""}
      </p>
      {historical && (
        <p className="memory-warning">
          {item.layout_id !== activeLayout
            ? "Different floor configuration. Historical evidence only."
            : "This lesson or its source was superseded. Historical evidence only."}
        </p>
      )}
      {item.error && <p role="status">{item.error}</p>}
      {item.delivery === "failed" && (
        <button
          className="floor-btn"
          disabled={busy}
          onClick={() => void send("retry", {})}
        >
          Retry memory delivery
        </button>
      )}
      {!historical &&
        (item.kind === "correction" ||
          item.kind === "action" ||
          item.kind === "environment_update") && (
          <>
            <label>
              Outcome or changed circumstances
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="What did staff observe afterward? Keep customer identities out of notes."
              />
            </label>
            <div className="ops-actions">
              {(["helped", "did_not_help", "unknown"] as const).map(
                (outcome) => (
                  <button
                    className="floor-btn"
                    key={outcome}
                    disabled={busy}
                    onClick={() => void send("feedback", { outcome, note })}
                  >
                    {outcome.replaceAll("_", " ")}
                  </button>
                ),
              )}
            </div>
            <button
              className="floor-btn"
              disabled={busy || !note.trim()}
              onClick={() => void send("supersede", { note })}
            >
              Replace lesson with changed circumstances
            </button>
          </>
        )}
      {error && (
        <p role="alert" className="memory-warning">
          {error}
        </p>
      )}
    </article>
  );
}

export default function SupervisorPage() {
  const [state, setState] = useState<SupervisorState | null>(null);
  const [floor, setFloor] = useState<FloorState | null>(null);
  const [context, setContext] = useState<ShiftContext>({
    delivery_activity: "unknown",
    staffing: "",
    note: "",
  });
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [table, setTable] = useState("");
  const [question, setQuestion] = useState("What should we do next?");
  const [compare, setCompare] = useState(false);
  const [answer, setAnswer] = useState<AdviceResult | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const sequence = useRef(0);
  const contextRevision = useRef<string>("");
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const [s, f] = await Promise.all([
        supervisorRequest<SupervisorState>(),
        floorRequest(),
      ]);
      if (id !== sequence.current) return;
      setState(s);
      setFloor(f);
      setConnectionError("");
      const revision = s.shift.id + s.shift.context_confirmed_at;
      if (revision !== contextRevision.current) {
        setContext(s.shift.context);
        contextRevision.current = revision;
      }
    } catch (e) {
      if (id === sequence.current)
        setConnectionError(
          e instanceof Error ? e.message : "Cannot load supervisor.",
        );
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      clearInterval(timer);
      ++sequence.current;
    };
  }, [refresh]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    ++sequence.current;
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };
  const submitContext = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await supervisorRequest("/context", context, "PUT");
      setNotice("Shift context confirmed by staff.");
    });
  };
  const capture = (e: FormEvent) => {
    e.preventDefault();
    const rec = floor?.recommendations[0];
    void run(async () => {
      await supervisorRequest("/experiences", {
        note,
        table_id: table || null,
        baseline_table_id: rec?.table_id || null,
        party_id: rec?.party_id || null,
        request_id: crypto.randomUUID(),
      });
      setNote("");
      setNotice(
        "Experience recorded locally. Delivery status shows when Hindsight has retained it.",
      );
    });
  };
  const ask = (e?: FormEvent) => {
    e?.preventDefault();
    void run(async () => {
      setAnswer(
        await supervisorRequest<AdviceResult>("/advice", { question, compare }),
      );
    });
  };
  const displayed = answer || state?.advice;
  const stale = (token: [string, number, number, string]) =>
    !state ||
    !floor ||
    token[0] !== floor.session_id ||
    token[1] !== floor.version ||
    token[2] !== state.revision ||
    token[3] !== state.layout_id;
  const tasks =
    floor?.tasks.filter((t) =>
      ["open", "acknowledged", "in_progress"].includes(t.status),
    ) ?? [];
  return (
    <div className="supervisor-page">
      <div className="floor-heading">
        <div>
          <div className="eyebrow">
            RESTAURANT EXPERIENCE / SHIFT SUPERVISOR
          </div>
          <h1>
            The next shift starts wiser<span>.</span>
          </h1>
          <p>
            Remember the reason. Review the evidence. Choose the next action.
          </p>
        </div>
        <Brain size={42} />
      </div>
      {(error || connectionError) && (
        <p role="alert" className="floor-stale">
          {error || connectionError}
        </p>
      )}
      {notice && (
        <p role="status" className="memory-notice">
          {notice}
        </p>
      )}
      <div className="supervisor-status">
        <b>{state?.shift.label ?? "Loading shift…"}</b>
        <span>
          {state?.integration.memory_configured
            ? "Memory configured"
            : "Memory awaiting setup"}
        </span>
        <span>
          {state?.integration.reasoner_configured
            ? "Reasoning configured"
            : "Reasoning awaiting setup"}
        </span>
        <span>
          {state?.integration.retained ?? 0} retained ·{" "}
          {state?.integration.pending ?? 0} pending ·{" "}
          {state?.integration.failed ?? 0} failed
        </span>
        <button className="floor-btn" onClick={() => void refresh()}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {state &&
        (!state.integration.memory_configured ||
          !state.integration.reasoner_configured) && (
          <details className="memory-setup" open>
            <summary>Connect real memory and reasoning</summary>
            <p>
              Add HINDSIGHT_BASE_URL, HINDSIGHT_API_KEY and AGENT_API_KEY to the
              backend environment, then restart this edition. Notes can be
              recorded while disconnected; they remain pending. Configured
              status does not establish successful service access.
            </p>
          </details>
        )}
      {state?.integration.last_error && (
        <p role="status" className="memory-warning">
          {state.integration.last_error}
        </p>
      )}
      <div className="supervisor-grid">
        <div>
          <section className="floor-panel">
            <div className="panel-title">
              <div>
                <Brain size={18} />
                <h2>What should we do next?</h2>
              </div>
            </div>
            <div className="memory-question-pills">
              {[
                "Why this table?",
                "What worked before?",
                "How should we recover this rush?",
              ].map((q) => (
                <button
                  key={q}
                  className="floor-btn"
                  onClick={() => setQuestion(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            <form onSubmit={ask}>
              <label>
                Operational question
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={500}
                  required
                />
              </label>
              <label className="memory-check">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(e) => setCompare(e.target.checked)}
                />{" "}
                Compare identical inputs with memory removed
              </label>
              <button
                className="floor-btn primary"
                disabled={
                  busy ||
                  state?.integration.generating ||
                  !state?.integration.memory_configured ||
                  !state.integration.reasoner_configured
                }
              >
                {busy || state?.integration.generating
                  ? "Gathering evidence…"
                  : "Ask supervisor"}
                <ArrowRight size={14} />
              </button>
            </form>
            {displayed && (
              <AdviceCards
                key={displayed.id}
                advice={displayed}
                floor={floor}
                stale={stale(displayed.token)}
                onChanged={() => {
                  setAnswer(null);
                  void refresh();
                }}
              />
            )}
          </section>

          <section className="floor-panel">
            <div className="panel-title">
              <div>
                <BookOpen size={18} />
                <h2>Shift handover</h2>
              </div>
            </div>
            <p>
              Past experience explains the context. The task list below reflects
              current operational records.
            </p>
            <button
              className="floor-btn primary"
              disabled={
                busy ||
                state?.integration.generating ||
                !state?.integration.memory_configured
              }
              onClick={() =>
                void run(async () => {
                  setHandover(
                    await supervisorRequest<Handover>("/handover", {}),
                  );
                })
              }
            >
              Prepare memory-backed briefing
            </button>
            {handover && (
              <>
                {stale(handover.token) && (
                  <p className="memory-warning">
                    This briefing is an earlier snapshot. Regenerate for current
                    advice.
                  </p>
                )}
                <div className="handover-text">{handover.text}</div>
                <EvidenceList items={handover.evidence} />
              </>
            )}
            <h3>Current open work · operational records</h3>
            {tasks.length ? (
              tasks.map((t) => (
                <p key={t.id}>
                  <b>
                    {t.table_id} · {t.kind.replaceAll("_", " ")}
                  </b>{" "}
                  — {t.status.replaceAll("_", " ")} · {t.priority || "normal"}{" "}
                  priority ·{" "}
                  {t.assigned_to
                    ? (floor?.staff.find((s) => s.id === t.assigned_to)?.name ??
                      t.assigned_to)
                    : "unassigned"}
                </p>
              ))
            ) : (
              <p>No active tasks recorded.</p>
            )}
            <Link to="/operations">Open staff desk →</Link>
          </section>

          <section className="floor-panel">
            <h2>Experience timeline</h2>
            <p>
              Staff reports and measured actions retain their source. An
              approval never counts as an outcome.
            </p>
            {state?.experiences.length ? (
              state.experiences.map((item) => (
                <ExperienceCard
                  key={item.id}
                  item={item}
                  activeLayout={state.layout_id}
                  changed={() => void refresh()}
                />
              ))
            ) : (
              <p>
                No experience recorded yet. Start with a manager correction.
              </p>
            )}
          </section>
        </div>
        <aside>
          <section className="floor-panel">
            <h2>Current shift context</h2>
            <p>Staff supplied information the camera cannot establish.</p>
            <form onSubmit={submitContext}>
              <label>
                Delivery activity
                <select
                  value={context.delivery_activity}
                  onChange={(e) =>
                    setContext({
                      ...context,
                      delivery_activity: e.target
                        .value as ShiftContext["delivery_activity"],
                    })
                  }
                >
                  <option value="unknown">Unknown / unconfirmed</option>
                  <option value="normal">Normal</option>
                  <option value="rush">Delivery rush</option>
                </select>
              </label>
              <label>
                Staff availability
                <input
                  value={context.staffing}
                  onChange={(e) =>
                    setContext({ ...context, staffing: e.target.value })
                  }
                  maxLength={240}
                  placeholder="One cleaner available; runner covering pickup"
                />
              </label>
              <label>
                Relevant conditions
                <textarea
                  value={context.note}
                  onChange={(e) =>
                    setContext({ ...context, note: e.target.value })
                  }
                  maxLength={500}
                  placeholder="Describe current arrangements; exclude personal customer data."
                />
              </label>
              <button className="floor-btn primary" disabled={busy}>
                Confirm shift context
              </button>
              <small>
                {state?.shift.context_confirmed_at
                  ? `Staff confirmed ${new Date(state.shift.context_confirmed_at).toLocaleString()}`
                  : "Temporary conditions have not been confirmed for this shift."}
              </small>
            </form>
          </section>
          <section className="floor-panel">
            <h2>Remember a correction</h2>
            <p>
              Record why you chose differently. This records experience; seating
              still requires explicit approval.
            </p>
            <form onSubmit={capture}>
              <label>
                Reported alternative table
                <select
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                >
                  <option value="">General operational experience</option>
                  {floor?.tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.capacity} seats
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reason and conditions
                <textarea
                  required
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="During delivery rushes, T2 beside pickup had repeated interruptions. We preferred T3. Outcome still needs staff confirmation."
                />
              </label>
              <button
                className="floor-btn primary"
                disabled={busy || !floor?.tables.length}
              >
                Remember experience
              </button>
            </form>
          </section>
          <section className="floor-panel">
            <h2>Start the next shift</h2>
            <p>
              Floor, queue and open tasks stay in place. Temporary context
              resets to unconfirmed.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await supervisorRequest("/shifts", { label });
                  setLabel("");
                  setAnswer(null);
                  setHandover(null);
                  setNotice(
                    "New shift started. Confirm current operating conditions.",
                  );
                });
              }}
            >
              <label>
                Shift label
                <input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                  placeholder="Evening shift"
                />
              </label>
              <button className="floor-btn" disabled={busy}>
                Start shift
              </button>
            </form>
          </section>
          <p className="memory-disclosure">
            Local prototype. Staff inputs are attributed reports, not
            authenticated manager identities. Controlled footage and seeded
            scenarios are synthetic. Memory adaptation does not train the vision
            model.
          </p>
        </aside>
      </div>
    </div>
  );
}
