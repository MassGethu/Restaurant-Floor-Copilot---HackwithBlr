import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Brain,
  Check,
  ClipboardList,
  Clock3,
  DoorOpen,
  LayoutGrid,
  Pause,
  Play,
  Plus,
  ScanLine,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import SupervisorHint from "../components/SupervisorCards";
import { api, apiUrl } from "../api/client";
import {
  floorRequest,
  type ExtraChairOption,
  type FloorState,
  type FloorTable,
  type Recommendation,
} from "../api/copilot";
import type { Video as VideoItem } from "../api/types";
import { useSectionJump } from "../hooks/useSectionJump";
import { formatDuration, formatSpan } from "../lib/format";

const statusLabels = {
  ready: "Free",
  occupied: "Guests seated",
  cleaning_required: "Needs cleaning",
  needs_verification: "Check this table",
};
const cameraSees: Record<string, string> = {
  absent: "Camera: empty",
  present: "Camera: people at table",
  unknown: "Camera: not sure yet",
  pending_arrival: "Camera: someone sitting down",
  pending_departure: "Camera: guests may be leaving",
};

/** The Floor never offers more than this many extra chairs (matches the backend). */
const MAX_EXTRA_CHAIRS = 2;
const chairs = (n: number) => `${n} extra chair${n === 1 ? "" : "s"}`;
const checkedOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function SeatingSuggestion({
  rec,
  index,
  state,
  busy,
  connected,
  act,
}: {
  rec: Recommendation;
  index: number;
  state: FloorState;
  busy: boolean;
  connected: boolean;
  act: (path: string, body?: unknown, method?: string) => Promise<boolean>;
}) {
  const [alternative, setAlternative] = useState("");
  const party = state.parties.find((p) => p.id === rec.party_id);
  const options = state.tables.filter(
    (t) =>
      t.seating_eligible &&
      rec.alternatives.some(
        (option) =>
          option.table_id === t.id && !option.displaced_party_names.length,
      ) &&
      t.capacity >= (party?.size ?? Infinity),
  );
  // A smaller free table with one or two extra chairs: offered, never recommended.
  const chairOptions = (state.extra_chair_options ?? []).filter(
    (o) => o.party_id === rec.party_id && o.alternative,
  );
  const chairValue = (o: ExtraChairOption) => `chair:${o.table_id}`;
  const chairChoice = chairOptions.find((o) => chairValue(o) === alternative);
  const selected =
    chairChoice || options.some((t) => t.id === alternative)
      ? alternative
      : rec.table_id;
  const chosen = options.find((t) => t.id === selected);
  const override = !chairChoice && selected !== rec.table_id;
  const comparison = rec.alternatives?.find((t) => t.table_id === selected);
  const rememberedChair = chairOptions.find((o) => chairFacts(o).roomKnown);
  const chairRoom = chairChoice ? chairFacts(chairChoice) : null;
  const seatWithChairs = (o: ExtraChairOption, roomChecked: boolean) =>
    void act("/seat", {
      party_id: o.party_id,
      table_id: o.table_id,
      version: o.version,
      extra_chairs: o.extra_chairs,
      room_checked: roomChecked,
    });
  return (
    <div className={`decision-card ${index === 0 ? "is-first" : ""}`}>
      <div className="decision-number">
        {index === 0 ? "Seat next" : `Then #${index + 1}`}
      </div>
      <h3>
        <span>
          {rec.party_name}
          <small>
            <Users size={13} /> {party?.size ?? "?"}
          </small>
        </span>
        <ArrowRight size={18} />
        <span>{rec.table_name}</span>
      </h3>
      <p>{rec.explanation}</p>
      {!chairChoice && rememberedChair && (
        <button
          type="button"
          className="chair-also"
          onClick={() => setAlternative(chairValue(rememberedChair))}
        >
          <Brain size={14} aria-hidden="true" />
          Also possible: {rememberedChair.table_name} with{" "}
          {chairs(rememberedChair.extra_chairs)}. You checked there’s room.
        </button>
      )}
      {options.length + chairOptions.length > 1 && (
        <label className="alternative-label">
          Prefer a different table?
          <select
            aria-label={`Table choice for ${rec.party_name}`}
            value={selected}
            onChange={(e) => setAlternative(e.target.value)}
          >
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.capacity} seats
                {t.id === rec.table_id ? " · recommended" : ""}
              </option>
            ))}
            {chairOptions.map((o) => (
              <option key={chairValue(o)} value={chairValue(o)}>
                {o.table_name} · {o.capacity} seats + {chairs(o.extra_chairs)}
                {chairFacts(o).roomKnown ? " · room remembered" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {chairChoice && <ChairMemoryNote option={chairChoice} />}
      {override && comparison && (
        <div className="choice-comparison">
          <b>If you pick {chosen?.name}</b>
          <span>
            {comparison.unused_seats === 0
              ? "No empty seats left over."
              : `${comparison.unused_seats} seat${comparison.unused_seats === 1 ? "" : "s"} left empty.`}{" "}
            {comparison.other_parties_seatable_now} other part
            {comparison.other_parties_seatable_now === 1 ? "y" : "ies"} can
            still be seated right now.
          </span>
          {comparison.displaced_party_names.length > 0 && (
            <strong>
              {comparison.displaced_party_names.join(", ")} would have to keep
              waiting.
            </strong>
          )}
        </div>
      )}
      {chairChoice && chairRoom ? (
        <>
          <button
            className="floor-btn primary"
            disabled={busy || !connected || chairRoom.checking}
            onClick={() => seatWithChairs(chairChoice, !chairRoom.roomKnown)}
          >
            <Check size={15} />
            {chairRoom.roomKnown
              ? `Seat at ${chairChoice.table_name} with ${chairs(chairChoice.extra_chairs)}`
              : `There’s room, seat at ${chairChoice.table_name}`}
          </button>
          <button
            className="decline-suggestion"
            disabled={busy || !connected || chairRoom.checking}
            onClick={async () => {
              if (
                await act("/extra-chairs/decline", {
                  party_id: chairChoice.party_id,
                  table_id: chairChoice.table_id,
                  version: chairChoice.version,
                  extra_chairs: chairChoice.extra_chairs,
                  // Only a first-time check is remembered; a remembered "room"
                  // that is blocked tonight stays remembered.
                  remember: !chairRoom.roomKnown,
                })
              )
                setAlternative("");
            }}
          >
            {chairRoom.roomKnown
              ? `Not ${chairChoice.table_name} tonight`
              : `No room at ${chairChoice.table_name}`}
          </button>
        </>
      ) : (
        <>
          <button
            className="floor-btn primary"
            disabled={busy || !connected}
            onClick={() =>
              void act("/seat", {
                party_id: rec.party_id,
                table_id: selected,
                version: rec.version,
                decision_key: rec.decision_key,
                override,
              })
            }
          >
            <Check size={15} />
            {override ? `Seat at ${chosen?.name}` : "Seat them"}
          </button>
          <button
            className="decline-suggestion"
            disabled={busy || !connected}
            onClick={() =>
              void act("/decline", {
                party_id: rec.party_id,
                table_id: rec.table_id,
                version: rec.version,
                decision_key: rec.decision_key,
              })
            }
          >
            Not this table, keep them waiting
          </button>
        </>
      )}
    </div>
  );
}

/** How sure we are that this table has room: remembered, unknown, or remembered no. */
function chairStanding(option: ExtraChairOption) {
  const memory = option.memory;
  if (memory.status !== "found") return 1;
  return memory.max_extra_chairs >= option.extra_chairs ? 0 : 2;
}

/** The best extra-chair option for each party: remembered room first. */
function bestChairOptions(options: ExtraChairOption[]) {
  const best = new Map<string, ExtraChairOption>();
  for (const option of options) {
    const current = best.get(option.party_id);
    if (!current || chairStanding(option) < chairStanding(current))
      best.set(option.party_id, option);
  }
  return [...best.values()];
}

/** What memory says about extra chairs for this option. */
function chairFacts(option: ExtraChairOption) {
  const memory = option.memory;
  const remembered = memory.status === "found";
  return {
    remembered,
    roomKnown: remembered && memory.max_extra_chairs >= option.extra_chairs,
    noRoomKnown: remembered && memory.max_extra_chairs === 0,
    checking: memory.status === "checking",
  };
}

/** The 🧠 line: checking memory, remembered room (or not), or first time. */
function ChairMemoryNote({ option }: { option: ExtraChairOption }) {
  const { memory, table_name: table } = option;
  const { roomKnown, noRoomKnown } = chairFacts(option);
  if (memory.status === "checking")
    return (
      <p className="chair-memory is-checking" role="status">
        <Brain size={15} aria-hidden="true" />
        Checking memory for {table}…
      </p>
    );
  if (memory.status === "found")
    return (
      <div className={`chair-memory ${roomKnown ? "is-room" : "is-no-room"}`}>
        <Brain size={15} aria-hidden="true" />
        <span>
          <b>
            {roomKnown
              ? `Remembered: ${table} has room for ${chairs(memory.max_extra_chairs)}.`
              : noRoomKnown
                ? `Remembered: ${table} has no room for extra chairs.`
                : `Remembered: ${table} has room for only ${chairs(memory.max_extra_chairs)}.`}
          </b>
          <small>
            You checked on {checkedOn(memory.recorded_at)}. Saved in Hindsight
            memory.
            {!roomKnown && " Check again before seating."}
          </small>
        </span>
      </div>
    );
  return (
    <p className="chair-memory is-unknown">
      <Brain size={15} aria-hidden="true" />
      {memory.status === "unavailable"
        ? "Memory isn’t answering right now. Check there’s room first."
        : `First time: check there’s room at ${table} first. The app will remember your answer.`}
    </p>
  );
}

function ExtraChairCard({
  option,
  busy,
  connected,
  act,
}: {
  option: ExtraChairOption;
  busy: boolean;
  connected: boolean;
  act: (path: string, body?: unknown, method?: string) => Promise<boolean>;
}) {
  const { extra_chairs: need, table_name: table } = option;
  const { roomKnown, checking } = chairFacts(option);
  const seat = (roomChecked: boolean) =>
    void act("/seat", {
      party_id: option.party_id,
      table_id: option.table_id,
      version: option.version,
      extra_chairs: need,
      room_checked: roomChecked,
    });
  const decline = (remember: boolean) =>
    void act("/extra-chairs/decline", {
      party_id: option.party_id,
      table_id: option.table_id,
      version: option.version,
      extra_chairs: need,
      remember,
    });
  const locked = busy || !connected || checking;
  return (
    <div className="decision-card chair-card">
      <div className="decision-number">Needs {chairs(need)}</div>
      <h3>
        <span>
          {option.party_name}
          <small>
            <Users size={13} /> {option.party_size}
          </small>
        </span>
        <ArrowRight size={18} />
        <span>{table}</span>
      </h3>
      <p>
        {table} seats {option.capacity}. No free table fits {option.party_size}
        , so they need {chairs(need)}.
      </p>
      <ChairMemoryNote option={option} />
      {roomKnown ? (
        <>
          <button
            className="floor-btn primary"
            disabled={locked}
            onClick={() => seat(false)}
          >
            <Check size={15} />
            Seat with {chairs(need)}
          </button>
          <button
            className="decline-suggestion"
            disabled={locked}
            onClick={() => decline(false)}
          >
            Not tonight, keep them waiting
          </button>
        </>
      ) : (
        <>
          <button
            className="floor-btn primary"
            disabled={locked}
            onClick={() => seat(true)}
          >
            <Check size={15} />
            There’s room, seat them
          </button>
          <button
            className="decline-suggestion"
            disabled={locked}
            onClick={() => decline(true)}
          >
            No room at {table}
          </button>
        </>
      )}
    </div>
  );
}

export default function FloorPage() {
  useSectionJump();
  const [state, setState] = useState<FloorState | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState(2);
  const [staffTable, setStaffTable] = useState<string | null>(null);
  // Close a table's ••• menu on Escape or a click anywhere outside it.
  useEffect(() => {
    if (!staffTable) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(`[data-menu-for="${CSS.escape(staffTable)}"]`))
        setStaffTable(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStaffTable(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [staffTable]);
  const requestId = useRef(0);
  const queueAttempt = useRef<{ input: string; id: string } | null>(null);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await floorRequest();
      if (id === requestId.current) {
        setState(data);
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    api
      .videos()
      .then((items) => {
        setVideos(items);
        setSelected(
          items.find((v) => v.id.includes("controlled"))?.id ??
            items[0]?.id ??
            "",
        );
      })
      .catch(() =>
        setError("Could not load footage. Check that the backend is running."),
      );
  }, []);
  const act = async (path: string, body?: unknown, method = "POST") => {
    setBusy(true);
    setError("");
    ++requestId.current;
    try {
      const data = await floorRequest(path, body, method);
      ++requestId.current;
      setState(data);
      setConnected(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };
  const addParty = async (e: FormEvent) => {
    e.preventDefault();
    if (!state) return;
    const input = JSON.stringify([state.session_id, name.trim(), size]);
    if (queueAttempt.current?.input !== input) {
      queueAttempt.current = { input, id: crypto.randomUUID() };
    }
    if (
      await act("/parties", {
        name,
        size,
        session_id: state.session_id,
        request_id: queueAttempt.current.id,
      })
    ) {
      queueAttempt.current = null;
      setName("");
    }
  };
  const tables = state?.tables ?? [];
  const waiting = state?.parties.filter((p) => p.status === "waiting") ?? [];
  // Parties bigger than every table can never get a suggestion; say so.
  const largest = Math.max(0, ...tables.map((t) => t.capacity));
  const tooBig = (guests: number) =>
    tables.length > 0 && guests > largest + MAX_EXTRA_CHAIRS;
  const oversized = waiting.filter((p) => tooBig(p.size));
  // Parties no normal table fits; alternatives show inside their seating card.
  const chairCards = bestChairOptions(
    (state?.extra_chair_options ?? []).filter((o) => !o.alternative),
  );
  const tooBigHelp = `The largest table seats ${largest}. Push tables together and seat them yourself, then remove them from the list.`;
  const ready = tables.filter((t) => t.seating_eligible).length;
  const occupied = tables.filter((t) => t.status === "occupied").length;
  const dirty = tables.filter((t) => t.status === "cleaning_required").length;
  const departures = tables.filter((t) => t.departure_review);
  const live =
    connected &&
    state?.source_status === "LIVE" &&
    state.model_state === "ready" &&
    state.observations_fresh;
  const now = state?.now ?? 0;
  const activeVideo = state?.playback.video_id;
  const staffMode = Boolean(state?.staff_mode);
  const canCheckClean = (table: FloorTable) =>
    !table.blocked &&
    !table.party_id &&
    (live ? table.observed === "absent" : staffMode);
  const currentVideo = videos.find((v) => v.id === state?.video_id);
  const isControlled = state?.video_id?.includes("controlled");
  const tableAction = (table: FloorTable, action: string) =>
    void act(`/tables/${encodeURIComponent(table.id)}`, {
      action,
      table_key: table.table_key,
    });
  // Run an action from a table's ••• menu and close the menu.
  const fromMenu = (run: () => void) => {
    setStaffTable(null);
    run();
  };

  // What staff are doing about a table, as reported from Staff tasks.
  const taskProgress = (tableId: string) => {
    const active = (state?.tasks ?? []).filter(
      (t) =>
        t.table_id === tableId &&
        ["open", "acknowledged", "in_progress"].includes(t.status),
    );
    const task =
      active.find((t) => t.kind === "cleaning") ??
      active.find((t) => t.kind === "service" || t.kind === "check_in");
    if (!task) return null;
    const cleaning = task.kind === "cleaning";
    const role = cleaning ? "cleaner" : "waiter";
    const who = state?.staff.find((p) => p.id === task.assigned_to)?.name;
    const text =
      task.status === "in_progress"
        ? cleaning
          ? `Being cleaned${who ? ` by ${who}` : ""}`
          : `${who ?? "A waiter"} is at the table`
        : task.status === "acknowledged"
          ? `${who ?? `A ${role}`} is on the way`
          : who
            ? `${who} has been asked`
            : `Waiting for a ${role}`;
    return { text, cleaning, status: task.status };
  };

  const openTasks =
    state?.tasks?.filter((t) =>
      ["open", "acknowledged", "in_progress"].includes(t.status),
    ).length ?? 0;
  const pendingArrivals =
    state?.arrivals?.filter((a) => a.status === "pending").length ?? 0;
  const statusText = !connected
    ? "Connecting…"
    : state?.model_state === "failed"
      ? "Camera unavailable"
      : state?.model_state === "loading"
        ? "Starting camera…"
        : state?.playback.paused
          ? "Camera paused"
          : live
            ? "Camera watching"
            : "Camera off";

  return (
    <div className="floor-page">
      <div className="floor-heading workspace-intro">
        <div>
          <div className="eyebrow">Tonight’s service</div>
          <h1>Floor</h1>
          <p>Who’s waiting, which tables are free, and who to seat next.</p>
        </div>
        <div className={`live-pill ${live ? "is-live" : ""}`}>
          <i />
          {statusText}
        </div>
      </div>

      {state && tables.length > 0 && (staffMode || !live) && (
        <section
          className="service-mode-bar needs-attention"
          aria-label="Service mode"
        >
          <div>
            <strong>
              {!connected
                ? "Lost connection to the app"
                : staffMode
                  ? "Camera off: staff are checking tables"
                  : "The camera isn’t seeing the floor"}
            </strong>
            <p role="status">
              {!connected
                ? "Keep using your paper list until it comes back."
                : staffMode
                  ? "Walk over and tap “Mark clean and free” on a table once you’ve checked it."
                  : state.playback.source_frozen
                    ? "The picture has frozen. Switch to staff checks to keep seating guests."
                    : "Switch to staff checks to keep seating guests."}
            </p>
          </div>
          <button
            className="floor-btn"
            disabled={busy || !connected || (staffMode && !live)}
            onClick={() =>
              void act("/service-mode", {
                mode: staffMode ? "camera" : "staff",
              })
            }
          >
            {staffMode ? "Turn camera back on" : "Use staff checks"}
          </button>
          {(!live || !state.playback.is_file) && (
            <button
              className="floor-btn"
              disabled={busy || !connected}
              onClick={() => void act("/reconnect", {})}
            >
              Reconnect camera
            </button>
          )}
        </section>
      )}
      {error && (
        <div className="floor-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="floor-metrics">
        {[
          {
            value: ready,
            label: "Free tables",
            sub: ready ? "Ready to seat now" : "None ready yet",
            color: "green",
          },
          {
            value: occupied,
            label: "Tables in use",
            sub: `${occupied} of ${tables.length} tables`,
            color: "blue",
          },
          {
            value: dirty,
            label: "Need cleaning",
            sub: dirty ? "Send a cleaner" : "All clean",
            color: "amber",
          },
          {
            value: waiting.length,
            label: "Parties waiting",
            sub: `${waiting.reduce((sum, p) => sum + p.size, 0)} guests`,
            color: "purple",
          },
        ].map((item) => (
          <div className={`floor-metric ${item.color}`} key={item.label}>
            <div>
              <span>{item.label}</span>
              <b>{item.value}</b>
              <small>{item.sub}</small>
            </div>
            <div className="metric-mark">
              {item.color === "purple" ? (
                <Users size={20} />
              ) : item.color === "amber" ? (
                <Sparkles size={20} />
              ) : (
                <LayoutGrid size={20} />
              )}
            </div>
          </div>
        ))}
      </div>

      {(departures.length > 0 || dirty > 0 || openTasks > 0 || pendingArrivals > 0) && (
        <section className="floor-panel cleaning-panel">
          <div className="panel-title">
            <div>
              <Sparkles size={17} />
              <h2>Needs your attention</h2>
            </div>
          </div>
          {departures.map((table) => (
            <div className="turnover-review" key={table.id}>
              <div>
                <b>Have the guests at {table.name} left?</b>
                <p>The camera thinks the table is empty. Take a quick look.</p>
              </div>
              <button
                className="floor-btn primary"
                disabled={busy || !connected}
                onClick={() => tableAction(table, "depart")}
              >
                Yes, they left
              </button>
              <button
                className="floor-btn"
                disabled={busy || !connected}
                onClick={() => tableAction(table, "still_seated")}
              >
                Still there
              </button>
            </div>
          ))}
          {state?.cleaning_priorities.map((task, i) => (
            <div className="cleaning-task" key={task.table_id}>
              <span>{i + 1}</span>
              <div>
                <h3>Clean {task.table_name}</h3>
                <p>{task.explanation}</p>
                {(() => {
                  const progress = taskProgress(task.table_id);
                  return progress ? (
                    <small className={`task-progress ${progress.status}`}>
                      {progress.text}
                    </small>
                  ) : null;
                })()}
              </div>
              <button
                aria-label={`Mark ${task.table_name} clean`}
                title="Mark clean and free"
                disabled={
                  busy ||
                  !connected ||
                  !tables.some(
                    (t) => t.id === task.table_id && canCheckClean(t),
                  )
                }
                onClick={() => {
                  const table = tables.find((t) => t.id === task.table_id);
                  if (table) tableAction(table, "clean");
                }}
              >
                <Check size={17} />
              </button>
            </div>
          ))}
          {(openTasks > 0 || pendingArrivals > 0) && (
            <nav className="attention-links" aria-label="Other work">
              {openTasks > 0 && (
                <Link to="/operations">
                  <ClipboardList size={15} aria-hidden="true" />
                  {openTasks} staff task{openTasks === 1 ? "" : "s"} open
                  <ArrowRight size={13} />
                </Link>
              )}
              {pendingArrivals > 0 && (
                <Link to="/operations?tab=arrivals">
                  <DoorOpen size={15} aria-hidden="true" />
                  {pendingArrivals} new arrival
                  {pendingArrivals === 1 ? "" : "s"} spotted at the door
                  <ArrowRight size={13} />
                </Link>
              )}
            </nav>
          )}
        </section>
      )}

      <div className="floor-main-grid">
        <div className="floor-left">
          <section className="floor-panel">
            <div className="panel-title">
              <div>
                <LayoutGrid size={17} />
                <h2>Tables</h2>
              </div>
              <div className="floor-legend">
                <span className="green">● Free</span>
                <span className="blue">● Seated</span>
                <span className="amber">● Cleaning</span>
                <span>● Check</span>
              </div>
            </div>
            {!tables.length ? (
              <div className="floor-empty">
                <LayoutGrid size={26} />
                <p>Draw your tables on the camera picture to get started.</p>
                <Link
                  to={state?.video_id ? `/setup/${state.video_id}` : "/setup"}
                >
                  Set up tables →
                </Link>
              </div>
            ) : (
              <div className="table-grid">
                {tables.map((table) => (
                  <article
                    className={`floor-table ${table.status}`}
                    key={table.id}
                  >
                    <div className="table-top">
                      <span>{table.id}</span>
                      <b>
                        <Users size={12} />
                        {table.capacity} seats
                      </b>
                    </div>
                    <div className="table-symbol">
                      <i />
                      <i />
                      <div>{table.name}</div>
                      <i />
                      <i />
                    </div>
                    <span className="table-status">
                      {table.blocked
                        ? "Not for walk-ins"
                        : table.departure_review
                          ? "Did they leave?"
                          : table.status === "ready" && !table.seating_eligible
                            ? "Check before seating"
                            : statusLabels[table.status]}
                    </span>
                    <div className="table-timer">
                      {table.status === "occupied" &&
                      table.occupied_since !== null ? (
                        <>
                          <Clock3 size={12} />
                          Seated {formatSpan(now - table.occupied_since)}
                        </>
                      ) : table.manual_hold ? (
                        table.hold_until ? (
                          `Checked by staff · ${Math.max(0, Math.ceil(table.hold_until - Date.now() / 1000))}s left`
                        ) : (
                          "Checked by staff"
                        )
                      ) : (
                        (cameraSees[table.observed] ??
                        `Camera: ${table.observed.replaceAll("_", " ")}`)
                      )}
                    </div>
                    {(() => {
                      const progress = taskProgress(table.id);
                      return progress ? (
                        <div className={`task-progress ${progress.status}`}>
                          {progress.cleaning ? (
                            <Sparkles size={12} aria-hidden="true" />
                          ) : (
                            <Bell size={12} aria-hidden="true" />
                          )}
                          {progress.text}
                        </div>
                      ) : null;
                    })()}
                    <div className="table-actions">
                      {table.departure_review && (
                        <>
                          <button
                            disabled={busy || !connected}
                            onClick={() => tableAction(table, "depart")}
                          >
                            They left
                          </button>
                          <button
                            disabled={busy || !connected}
                            onClick={() => tableAction(table, "still_seated")}
                          >
                            Still there
                          </button>
                        </>
                      )}
                      {(table.status === "cleaning_required" ||
                        table.status === "needs_verification" ||
                        (table.status === "ready" &&
                          staffMode &&
                          !table.seating_eligible)) &&
                        canCheckClean(table) && (
                          <button
                            className="primary-action"
                            disabled={busy || !connected}
                            onClick={() => tableAction(table, "clean")}
                          >
                            <Check size={12} />
                            Mark clean and free
                          </button>
                        )}
                      <button
                        onClick={() =>
                          setStaffTable(
                            staffTable === table.id ? null : table.id,
                          )
                        }
                        aria-label={`More actions for ${table.name}`}
                        aria-expanded={staffTable === table.id}
                        title="More actions"
                        data-menu-for={table.id}
                      >
                        •••
                      </button>
                    </div>
                    {staffTable === table.id && (
                      <div className="staff-actions" data-menu-for={table.id}>
                        {table.status === "occupied" || table.party_id ? (
                          <button
                            disabled={busy || !connected}
                            onClick={() =>
                              fromMenu(() => tableAction(table, "depart"))
                            }
                          >
                            Guests have left
                          </button>
                        ) : null}
                        {(table.status === "occupied" ||
                          table.status === "needs_verification") && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              fromMenu(
                                () =>
                                  void act(`/tables/${table.id}/service`, {
                                    note: "Manager requested a service visit.",
                                  }),
                              )
                            }
                          >
                            Send a waiter
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() =>
                            fromMenu(() => tableAction(table, "hold_occupied"))
                          }
                        >
                          Mark as taken
                        </button>
                        <button
                          disabled={busy || !connected}
                          onClick={() =>
                            fromMenu(() =>
                              tableAction(
                                table,
                                table.blocked ? "unblock" : "block",
                              ),
                            )
                          }
                        >
                          {table.blocked
                            ? "Allow walk-ins again"
                            : "Keep free (no walk-ins)"}
                        </button>
                        {table.manual_hold && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              fromMenu(() => tableAction(table, "release"))
                            }
                          >
                            Undo staff check
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="floor-panel queue-panel" id="add-party" data-section>
            <div className="panel-title">
              <div>
                <Users size={17} />
                <h2>Waiting list</h2>
                <span className="count-chip">{waiting.length}</span>
              </div>
            </div>
            <form className="party-form" onSubmit={(e) => void addParty(e)}>
              <label>
                Name
                <input
                  data-section-focus
                  placeholder="e.g. Sharma"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Guests
                <input
                  aria-label="Party size"
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
              </label>
              <button
                className="floor-btn primary"
                disabled={busy || !connected || !tables.length}
              >
                <Plus size={15} />
                Add to list
              </button>
            </form>
            {tooBig(size) ? (
              <p className="too-big-note" role="status">
                No table seats {size}. {tooBigHelp}
              </p>
            ) : (
              tables.length > 0 &&
              size > largest && (
                <p className="chair-note" role="status">
                  No table seats {size}. When the {largest}-seat table is free,
                  the app will offer it with {chairs(size - largest)}.
                </p>
              )
            )}
            <ul className="wait-list">
              {waiting.map((party) => {
                const rec = state?.recommendations.find(
                  (r) => r.party_id === party.id,
                );
                const chair = chairCards.find((o) => o.party_id === party.id);
                const estimate = state?.wait_estimates[party.id];
                const hasEstimate =
                  estimate?.min_minutes != null && estimate.max_minutes != null;
                return (
                  <li key={party.id}>
                    <span className="party-avatar">
                      {party.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="wait-who">
                      <b>{party.name}</b>
                      <small>
                        {party.size} guest{party.size === 1 ? "" : "s"} ·
                        waiting {formatSpan(now - party.arrived_at)}
                        {hasEstimate &&
                          estimate!.max_minutes! > 0 &&
                          ` · about ${estimate!.min_minutes}–${estimate!.max_minutes} min more`}
                      </small>
                    </div>
                    {rec ? (
                      <span className="queue-ready">{rec.table_name} is ready</span>
                    ) : chair ? (
                      <span className="queue-chair">
                        {chair.table_name} + {chairs(chair.extra_chairs)}
                      </span>
                    ) : tooBig(party.size) ? (
                      <span className="queue-too-big" title={tooBigHelp}>
                        Too big for any table
                      </span>
                    ) : (
                      <span className="queue-waiting">Waiting for a table</span>
                    )}
                    <button
                      aria-label={`Remove ${party.name}`}
                      title="Remove from list"
                      disabled={busy}
                      onClick={() =>
                        void act(`/parties/${party.id}`, undefined, "DELETE")
                      }
                    >
                      <X size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {!waiting.length && (
              <div className="small-empty">
                Nobody is waiting. Add the next party above.
              </div>
            )}
          </section>
        </div>

        <aside className="floor-right">
          <section className="decision-panel">
            <div className="panel-title">
              <div>
                <Sparkles size={18} />
                <h2>Who to seat next</h2>
              </div>
            </div>
            {state?.recommendations.length || chairCards.length ? (
              <>
                {state?.recommendations.map((rec, index) => (
                  <SeatingSuggestion
                    key={rec.party_id}
                    rec={rec}
                    index={index}
                    state={state}
                    busy={busy}
                    connected={connected}
                    act={act}
                  />
                ))}
                {chairCards.map((option) => (
                  <ExtraChairCard
                    key={option.party_id}
                    option={option}
                    busy={busy}
                    connected={connected}
                    act={act}
                  />
                ))}
              </>
            ) : (
              <div className="decision-empty">
                <div>
                  <Check size={24} />
                </div>
                <h3>
                  {!waiting.length
                    ? "All caught up"
                    : oversized.length === waiting.length
                      ? "No table is big enough"
                      : !live && !staffMode
                      ? "Waiting for the camera"
                      : "No table fits yet"}
                </h3>
                <p>
                  {!waiting.length
                    ? "Add a party to the waiting list and a suggestion will appear here."
                    : oversized.length === waiting.length
                      ? tooBigHelp
                      : !live && !staffMode
                      ? "Start the camera, or switch to staff checks, to get a suggestion."
                      : "Mark a table clean and free when one opens up."}
                </p>
              </div>
            )}
            {oversized.length > 0 && oversized.length < waiting.length && (
              <p className="too-big-note">
                {oversized
                  .map((p) => `${p.name} (${p.size})`)
                  .join(", ")}{" "}
                {oversized.length === 1 ? "is" : "are"} too big for any table.{" "}
                {tooBigHelp}
              </p>
            )}
            <div className="policy-note">
              <ScanLine size={14} />
              <span>The camera watches, the app suggests, you decide.</span>
            </div>
          </section>
          {!staffMode && <SupervisorHint floor={state} />}
        </aside>
      </div>

      <details className="floor-panel floor-more">
        <summary>
          <Video size={17} />
          <span>
            <b>Camera</b>
            <small>
              {currentVideo?.name ?? "No footage"} · {statusText}
            </small>
          </span>
        </summary>
        <div className="camera-window">
          {activeVideo && state ? (
            <img
              key={state.playback.session_id}
              src={apiUrl("/api/stream")}
              alt="Camera view with people detected and table areas outlined"
            />
          ) : (
            <div className="camera-empty">
              <ScanLine size={42} strokeWidth={1} />
              <h3>No camera running</h3>
              <p>Pick a video below to start.</p>
              <Link to="/videos">
                Manage videos <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {activeVideo && state && (
            <div className="camera-caption">
              <span>
                <i />
                {!state.playback.is_file
                  ? "LIVE CAMERA"
                  : isControlled
                    ? "DEMO VIDEO · REAL DETECTION"
                    : "RECORDED VIDEO · REAL DETECTION"}
              </span>
              <b>{formatDuration(state.playback.position_seconds)}</b>
            </div>
          )}
        </div>
        <div className="camera-controls">
          <select
            aria-label="Select footage"
            value={selected || state?.video_id || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="" disabled>
              Select footage
            </option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button
            className="floor-btn primary"
            disabled={busy || !(selected || state?.video_id)}
            onClick={() =>
              void act("/play", { video_id: selected || state?.video_id })
            }
          >
            <Play size={14} />
            {activeVideo ? "Start over" : "Start"}
          </button>
          <button
            className="floor-btn"
            disabled={
              busy ||
              !activeVideo ||
              !state?.playback.is_file ||
              state.playback.ended
            }
            onClick={() =>
              void act("/pause", { paused: !state?.playback.paused })
            }
          >
            {state?.playback.paused ? <Play size={15} /> : <Pause size={15} />}
            {state?.playback.paused ? "Resume" : "Pause"}
          </button>
        </div>
        <div className="camera-note">
          “Start over” begins a fresh service and saves the old one.
          {state?.playback.ended && <strong> The video has ended.</strong>}
        </div>
      </details>

      <details className="floor-panel floor-more">
        <summary>
          <Clock3 size={17} />
          <span>
            <b>What happened</b>
            <small>Every action on the floor, newest first</small>
          </span>
        </summary>
        <div className="activity-list">
          {state?.events.slice(0, 12).map((event) => (
            <div key={event.id}>
              <span className={`event-origin ${event.origin}`}>
                {event.origin === "vision" ? "camera" : event.origin}
              </span>
              <p>{event.text}</p>
            </div>
          ))}
          {!state?.events.length && (
            <div className="small-empty">Nothing has happened yet.</div>
          )}
        </div>
      </details>
    </div>
  );
}
