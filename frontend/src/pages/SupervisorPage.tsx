import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CloudSun,
  History,
  PenLine,
  RotateCcw,
} from "lucide-react";
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
import {
  AdviceCards,
  EvidenceList,
  kindLabel,
} from "../components/SupervisorCards";

const deliveryLabels: Record<string, string> = {
  retained: "Saved to memory",
  pending: "Saving…",
  failed: "Not saved",
};
const outcomeLabels = {
  helped: "It helped",
  did_not_help: "It didn’t help",
  unknown: "Not sure",
};
import { useSectionJump } from "../hooks/useSectionJump";

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
        <b>{kindLabel(item.kind)}</b>
        <span className={`memory-status ${item.delivery}`}>
          {deliveryLabels[item.delivery] ?? item.delivery}
        </span>
      </header>
      <small>{new Date(item.recorded_at).toLocaleString()}</small>
      <p>
        {item.content.note ||
          (item.content.action
            ? `${item.content.accepted ? "Approved" : "Declined"}: ${item.content.action.reason}`
            : item.content.outcome?.replaceAll("_", " "))}
      </p>
      {item.content.baseline_table_id && (
        <p>
          App suggested {item.content.baseline_table_id} → manager chose{" "}
          {item.content.chosen_table_id || "another table"}
        </p>
      )}
      {item.content.outcome && (
        <b>Outcome: {item.content.outcome.replaceAll("_", " ")}</b>
      )}
      {historical && (
        <p className="memory-warning">
          {item.layout_id !== activeLayout
            ? "Saved for a different table layout, so it won’t be used now."
            : "This lesson was replaced by a newer one."}
        </p>
      )}
      {item.error && <p role="status">{item.error}</p>}
      {item.delivery === "failed" && (
        <button
          className="floor-btn"
          disabled={busy}
          onClick={() => void send("retry", {})}
        >
          Try saving again
        </button>
      )}
      {!historical &&
        (item.kind === "correction" ||
          item.kind === "action" ||
          item.kind === "environment_update") && (
          <>
            <label>
              How did it go? (optional note)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="e.g. Guests at T3 had a quieter meal. No customer names."
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
                    {outcomeLabels[outcome]}
                  </button>
                ),
              )}
            </div>
            <button
              className="floor-btn"
              disabled={busy || !note.trim()}
              onClick={() => void send("supersede", { note })}
            >
              Update this lesson
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
  useSectionJump();
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
  const [compare, setCompare] = useState(true);
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
      setNotice("Tonight’s conditions saved.");
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
        "Lesson saved. It will be used in future advice once it shows “Saved to memory”.",
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
  const ready =
    state?.integration.memory_configured &&
    state.integration.reasoner_configured;
  const thinking = Boolean(busy || state?.integration.generating);
  const deliveryText = {
    unknown: "Deliveries not set",
    normal: "Normal deliveries",
    rush: "Delivery rush",
  }[state?.shift.context.delivery_activity ?? "unknown"];
  const confirmedAt = state?.shift.context_confirmed_at
    ? new Date(state.shift.context_confirmed_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="supervisor-page">
      <header className="page-title">
        <div>
          <h1>AI Supervisor</h1>
          <p>
            Learns from past shifts and uses those lessons to suggest what to
            do next.
          </p>
        </div>
        {state && (
          <div className={`live-pill ${ready ? "is-live" : ""}`}>
            <i />
            {ready
              ? `Memory on · ${state.integration.retained} lessons saved`
              : "Memory not connected"}
          </div>
        )}
      </header>

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
      {state && !ready && (
        <details className="memory-setup">
          <summary>Memory isn’t connected. How to connect it</summary>
          <p>
            You can still run the floor and save lessons; they’ll wait until
            memory is connected. Add HINDSIGHT_BASE_URL, HINDSIGHT_API_KEY and
            AGENT_API_KEY to the backend settings and restart.
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
          <section
            className="floor-panel sup-advice"
            id="advice"
            data-section
            tabIndex={-1}
          >
            <div className="panel-title">
              <div>
                <Brain size={18} />
                <h2>Advice</h2>
              </div>
            </div>
            {displayed ? (
              <AdviceCards
                key={displayed.id}
                advice={displayed}
                floor={floor}
                stale={stale(displayed.token) || Boolean(floor?.staff_mode)}
                onChanged={() => {
                  setAnswer(null);
                  void refresh();
                }}
                onAskAgain={ready ? () => ask() : undefined}
                asking={thinking}
              />
            ) : (
              <div className="sup-empty">
                <p>
                  Ask what to do next. It checks tonight’s floor against lessons
                  from past shifts.
                </p>
                <button
                  className="floor-btn primary"
                  disabled={thinking || !ready}
                  onClick={() => ask()}
                >
                  {thinking ? "Thinking…" : "Ask for advice"}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            <details className="memory-more sup-ask">
              <summary>Ask a different question</summary>
              <form onSubmit={ask}>
                <div className="memory-question-pills">
                  {[
                    "What should we do next?",
                    "Why this table?",
                    "What worked before?",
                    "How do we get through this rush?",
                  ].map((q) => (
                    <button
                      type="button"
                      key={q}
                      className={`floor-btn ${question === q ? "is-picked" : ""}`}
                      onClick={() => setQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <label>
                  Your question
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
                  Also show what it would say without memory
                </label>
                <button
                  className="floor-btn primary"
                  disabled={thinking || !ready}
                >
                  {thinking ? "Thinking…" : "Ask"}
                  <ArrowRight size={14} />
                </button>
              </form>
            </details>
          </section>

          <details className="floor-panel floor-more" id="experience">
            <summary>
              <History size={17} />
              <span>
                <b>Lessons learned</b>
                <small>
                  {state?.experiences.length ?? 0} saved · mark whether each one
                  helped
                </small>
              </span>
            </summary>
            <div className="sup-lessons">
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
                <p>No lessons yet. Use “Teach it a lesson” to add one.</p>
              )}
            </div>
          </details>
        </div>

        <aside>
          <details
            className="floor-panel floor-more sup-tonight"
            id="context"
          >
            <summary>
              <CloudSun size={17} />
              <span>
                <b>Tonight: {deliveryText}</b>
                <small>
                  {confirmedAt
                    ? `Saved ${confirmedAt}${state?.shift.context.staffing ? ` · ${state.shift.context.staffing}` : ""}`
                    : "Not saved for this shift yet"}
                </small>
              </span>
            </summary>
            <form onSubmit={submitContext} className="sup-form">
              <p>Things the camera can’t see. Advice takes these into account.</p>
              <label>
                Delivery orders
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
                  <option value="unknown">Not sure</option>
                  <option value="normal">Normal</option>
                  <option value="rush">Delivery rush</option>
                </select>
              </label>
              <label>
                Staff on shift
                <input
                  value={context.staffing}
                  onChange={(e) =>
                    setContext({ ...context, staffing: e.target.value })
                  }
                  maxLength={240}
                  placeholder="e.g. One cleaner, two waiters"
                />
              </label>
              <label>
                Anything else
                <textarea
                  value={context.note}
                  onChange={(e) =>
                    setContext({ ...context, note: e.target.value })
                  }
                  maxLength={500}
                  placeholder="e.g. Pickup counter is busy. No customer names."
                />
              </label>
              <button className="floor-btn primary" disabled={busy}>
                Save
              </button>
            </form>
          </details>

          <section
            className="floor-panel"
            id="handover"
            data-section
            tabIndex={-1}
          >
            <div className="panel-title">
              <div>
                <BookOpen size={18} />
                <h2>Shift handover</h2>
              </div>
            </div>
            <p>Brief the next manager on what’s open and what’s been learned.</p>
            <div className="ops-actions">
              <button
                className="floor-btn primary"
                disabled={busy || !floor}
                onClick={() =>
                  void run(async () => {
                    setHandover(await supervisorRequest<Handover>("/handover"));
                  })
                }
              >
                What’s still open
              </button>
              <button
                className="floor-btn"
                disabled={thinking || !state?.integration.memory_configured}
                onClick={() =>
                  void run(async () => {
                    setHandover(
                      await supervisorRequest<Handover>("/handover", {}),
                    );
                  })
                }
              >
                Add past lessons
              </button>
            </div>
            {handover && (
              <>
                {stale(handover.token) && (
                  <p className="memory-warning">
                    The floor has changed since this brief. Make a new one.
                  </p>
                )}
                <div className="handover-text">{handover.text}</div>
                {handover.mode !== "operations" && (
                  <EvidenceList items={handover.evidence} />
                )}
              </>
            )}
            <h3>Still open right now</h3>
            {tasks.length ? (
              <ul className="sup-open">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <b>
                      {floor?.tables.find((x) => x.id === t.table_id)?.name ??
                        t.table_id}
                    </b>{" "}
                    · {t.kind.replaceAll("_", " ")} ·{" "}
                    {t.assigned_to
                      ? (floor?.staff.find((s) => s.id === t.assigned_to)
                          ?.name ?? t.assigned_to)
                      : "nobody assigned"}
                    {t.priority === "high" && " · urgent"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nothing open.</p>
            )}
            <Link to="/operations">Go to staff tasks →</Link>
          </section>

          <details className="floor-panel floor-more" id="correction">
            <summary>
              <PenLine size={17} />
              <span>
                <b>Teach it a lesson</b>
                <small>When you’d seat someone differently</small>
              </span>
            </summary>
            <form onSubmit={capture} className="sup-form">
              <p>Say why, and it’ll remember next time.</p>
              <label>
                Table you chose instead
                <select
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                >
                  <option value="">No specific table</option>
                  {floor?.tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.capacity} seats
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Why?
                <textarea
                  required
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="e.g. During delivery rushes, T2 next to the pickup counter keeps getting interrupted. T3 is quieter."
                />
              </label>
              <button
                className="floor-btn primary"
                disabled={busy || !floor?.tables.length}
              >
                Save lesson
              </button>
            </form>
          </details>

          <details className="floor-panel floor-more">
            <summary>
              <RotateCcw size={17} />
              <span>
                <b>Start a new shift</b>
                <small>Current: {state?.shift.label ?? "…"}</small>
              </span>
            </summary>
            <form
              className="sup-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await supervisorRequest("/shifts", { label });
                  setLabel("");
                  setAnswer(null);
                  setHandover(null);
                  setNotice("New shift started. Set tonight’s conditions.");
                });
              }}
            >
              <p>
                Guests, tables and tasks stay as they are. Tonight’s conditions
                are cleared for the next manager.
              </p>
              <label>
                Shift name
                <input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Saturday dinner"
                />
              </label>
              <button className="floor-btn" disabled={busy}>
                Start shift
              </button>
            </form>
          </details>
          <p className="memory-disclosure">
            Prototype for a single trusted desk. Demo video and scenarios are
            staged. Staff approve every action.
          </p>
        </aside>
      </div>
    </div>
  );
}
