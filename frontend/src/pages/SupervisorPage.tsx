import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Brain,
  BookOpen,
  ArrowRight,
  History,
  PenLine,
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
  const thinking = busy || state?.integration.generating;
  const deliveryText = {
    unknown: "Not set",
    normal: "Normal",
    rush: "Delivery rush",
  }[context.delivery_activity];
  return (
    <div className="supervisor-page">
      <div className="floor-heading workspace-intro">
        <div>
          <div className="eyebrow">Learns from every shift</div>
          <h1>AI Supervisor</h1>
          <p>
            Tell it what worked. It remembers, and uses those lessons to
            suggest what to do next.
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
      </div>

      <ol className="sup-steps" aria-label="How it works">
        <li>
          <Link to="#context">
            <b>1</b>
            <span>
              <strong>Tell it about tonight</strong>
              <small>Rush? Short-staffed?</small>
            </span>
          </Link>
        </li>
        <li>
          <Link to="#advice">
            <b>2</b>
            <span>
              <strong>Ask for advice</strong>
              <small>It checks past lessons</small>
            </span>
          </Link>
        </li>
        <li>
          <Link to="#correction">
            <b>3</b>
            <span>
              <strong>Teach it a lesson</strong>
              <small>When you’d do it differently</small>
            </span>
          </Link>
        </li>
        <li>
          <Link to="#handover">
            <b>4</b>
            <span>
              <strong>Hand over</strong>
              <small>Brief the next manager</small>
            </span>
          </Link>
        </li>
      </ol>

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
        <details className="memory-setup" open>
          <summary>Memory isn’t connected</summary>
          <p>
            You can still run the floor and save lessons; they’ll wait until
            memory is connected. To connect it, add HINDSIGHT_BASE_URL,
            HINDSIGHT_API_KEY and AGENT_API_KEY to the backend settings and
            restart.
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
                <h2>Ask for advice</h2>
              </div>
            </div>
            <form onSubmit={ask} className="sup-ask">
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
            {displayed && (
              <AdviceCards
                key={displayed.id}
                advice={displayed}
                floor={floor}
                stale={stale(displayed.token) || Boolean(floor?.staff_mode)}
                onChanged={() => {
                  setAnswer(null);
                  void refresh();
                }}
              />
            )}
          </section>

          <section
            className="floor-panel"
            id="handover"
            data-section
            tabIndex={-1}
          >
            <div className="panel-title">
              <div>
                <BookOpen size={18} />
                <h2>Hand over to the next manager</h2>
              </div>
            </div>
            <p>
              A short brief of what’s still open, plus the lessons worth
              knowing.
            </p>
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
              <p>Nothing open. 🎉</p>
            )}
            <Link to="/operations">Go to staff tasks →</Link>
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
                <p>No lessons yet. Teach it one on the right.</p>
              )}
            </div>
          </details>
        </div>

        <aside>
          <section
            className="floor-panel"
            id="context"
            data-section
            tabIndex={-1}
          >
            <h2>Tonight’s conditions</h2>
            <p>Things the camera can’t see. The advice takes these into account.</p>
            <form onSubmit={submitContext}>
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
              <small>
                {state?.shift.context_confirmed_at
                  ? `Saved ${new Date(state.shift.context_confirmed_at).toLocaleString()} · deliveries: ${deliveryText}`
                  : "Not saved for this shift yet."}
              </small>
            </form>
          </section>
          <section
            className="floor-panel"
            id="correction"
            data-section
            tabIndex={-1}
          >
            <h2>Teach it a lesson</h2>
            <p>
              Did you seat someone differently from what the app suggested?
              Say why, and it’ll remember next time.
            </p>
            <form onSubmit={capture}>
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
                <PenLine size={14} /> Save lesson
              </button>
            </form>
          </section>
          <section className="floor-panel">
            <h2>Start a new shift</h2>
            <p>
              Guests, tables and tasks stay as they are. Tonight’s conditions
              are cleared so the next manager sets their own.
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
                    "New shift started. Fill in tonight’s conditions.",
                  );
                });
              }}
            >
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
            <small>Current shift: {state?.shift.label ?? "…"}</small>
          </section>
          <p className="memory-disclosure">
            Prototype for a single trusted desk. Demo video and scenarios are
            staged. Memory changes advice only; it never trains the camera
            model, and staff approve every action.
          </p>
        </aside>
      </div>
    </div>
  );
}
