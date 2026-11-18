import { requestId as newRequestId } from "../lib/requestId";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LayoutGrid, ArrowRight, Check } from "lucide-react";
import { floorRequest, FloorRequestError } from "../api/copilot";
import "../autonomy.css";

type Door = {
  session_id: string;
  accepting: boolean;
  waiting: number;
  max_party_size: number;
};
type Ticket = {
  party_id: string;
  name: string;
  size: number;
  status: string;
  table_name?: string | null;
  arrival_confirmed?: boolean;
};
type Attempt = {
  name: string;
  size: number;
  session_id: string;
  request_id: string;
};
function savedAttempt(): Attempt | null {
  try {
    return JSON.parse(
      sessionStorage.getItem("floor-check-in-attempt") ?? "null",
    ) as Attempt | null;
  } catch {
    return null;
  }
}

export default function CheckInPage() {
  const [door, setDoor] = useState<Door | null>(null);
  const [name, setName] = useState(() => savedAttempt()?.name ?? "");
  const [size, setSize] = useState(() => savedAttempt()?.size ?? 2);
  const [attemptLocked, setAttemptLocked] = useState(() =>
    Boolean(savedAttempt()),
  );
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [missingTicket, setMissingTicket] = useState(false);
  const [submitted, setSubmitted] = useState(() =>
    Boolean(sessionStorage.getItem("floor-check-in")),
  );
  const requestId = useRef(
    sessionStorage.getItem("floor-check-in") ?? newRequestId(),
  );
  const attempt = useRef<Attempt | null>(savedAttempt());
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await floorRequest<Door>("/check-in");
        if (stopped) return;
        setDoor(value);
        setConnected(true);
        if (submitted) {
          try {
            const result = await floorRequest<Ticket>(
              `/check-in/${encodeURIComponent(requestId.current)}`,
            );
            if (!stopped) {
              setTicket(result);
              setMissingTicket(false);
              setError("");
            }
          } catch (cause) {
            if (
              !stopped &&
              cause instanceof FloorRequestError &&
              cause.status === 404
            ) {
              setMissingTicket(true);
              setError(
                "No check-in was found for this service. You can retry the same request, or start again if service has restarted.",
              );
            } else if (!stopped) setConnected(false);
          }
        }
      } catch {
        if (!stopped) setConnected(false);
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [submitted]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!door || busy) return;
    setBusy(true);
    setError("");
    // Keep exactly the same body on an uncertain retry; the server deduplicates it.
    attempt.current ??= {
      name,
      size,
      session_id: door.session_id,
      request_id: requestId.current,
    };
    setAttemptLocked(true);
    sessionStorage.setItem(
      "floor-check-in-attempt",
      JSON.stringify(attempt.current),
    );
    sessionStorage.setItem("floor-check-in", requestId.current);
    try {
      const value = await floorRequest<Ticket>("/check-in", attempt.current);
      setTicket(value);
      setSubmitted(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check-in was unsuccessful. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const allocated = ticket?.status === "seated";
  const reset = () => {
    sessionStorage.removeItem("floor-check-in");
    sessionStorage.removeItem("floor-check-in-attempt");
    requestId.current = newRequestId();
    attempt.current = null;
    setAttemptLocked(false);
    setSubmitted(false);
    setTicket(null);
    setMissingTicket(false);
    setError("");
    setName("");
  };
  const retry = async () => {
    if (!attempt.current || busy) return;
    setBusy(true);
    try {
      const value = await floorRequest<Ticket>("/check-in", attempt.current);
      setTicket(value);
      setMissingTicket(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="guest-page" id="guest-main">
      <a className="guest-skip" href="#guest-form">
        Skip to check-in
      </a>
      <div className="guest-brand">
        <LayoutGrid size={23} />
        Floor Copilot
      </div>
      <section className="guest-card" id="guest-form" tabIndex={-1}>
        <ol className="guest-journey" aria-label="Your check-in progress">
          {["Join the list", "Get your table", "Settle in"].map(
            (step, index) => {
              const current = !submitted
                ? 0
                : ticket?.status === "seated"
                  ? 2
                  : 1;
              return (
                <li
                  key={step}
                  className={index <= current ? "is-active" : ""}
                  aria-current={index === current ? "step" : undefined}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              );
            },
          )}
        </ol>
        <div className="eyebrow">WELCOME IN</div>
        {!submitted ? (
          <>
            <h1>A table for your party.</h1>
            <p>
              Join the waiting list here. We’ll assign a suitable table and send
              a team member to welcome you.
            </p>
            <form onSubmit={(event) => void submit(event)}>
              <label>
                Your name
                <input
                  name="guest_name"
                  autoComplete="given-name"
                  maxLength={60}
                  required
                  value={name}
                  disabled={busy || attemptLocked}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya…"
                />
              </label>
              <label>
                How many guests?
                <input
                  type="number"
                  name="party_size"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  required
                  value={size}
                  disabled={busy || attemptLocked}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
              </label>
              <button
                className="floor-btn primary"
                disabled={busy || !connected || !door?.accepting}
              >
                {busy ? "Checking you in…" : "Join the waiting list"}
                <ArrowRight size={16} />
              </button>
            </form>
            {attemptLocked && (
              <p className="guest-footnote">
                A retry uses your original name and party size to prevent
                duplicate check-ins.
              </p>
            )}
            {attemptLocked &&
              attempt.current?.session_id !== door?.session_id &&
              connected && (
                <button className="floor-btn" type="button" onClick={reset}>
                  Service restarted · start a new check-in
                </button>
              )}
            <p className="guest-footnote">
              {door?.accepting
                ? `${door.waiting} ${door.waiting === 1 ? "party" : "parties"} currently waiting`
                : "Check-in opens when service is ready."}
            </p>
          </>
        ) : (
          <>
            <h1 aria-live="polite">
              {allocated
                ? "Your table is assigned."
                : ticket?.status === "departed"
                  ? "Thanks for joining us."
                  : ticket?.status === "cancelled"
                    ? "Your check-in is closed."
                    : "You’re on the list."}
            </h1>
            <p>
              {ticket
                ? `${ticket.name} · ${ticket.size} guests`
                : "Retrieving your check-in…"}
            </p>
            {allocated ? (
              <div className="ticket-table">
                <span>
                  {ticket.arrival_confirmed
                    ? "Arrival confirmed"
                    : "A team member will guide you"}
                </span>
                <strong>
                  {ticket.table_name ?? "Preparing table details…"}
                </strong>
              </div>
            ) : ticket?.status === "waiting" ? (
              <div className="ticket-table">
                <Check size={24} style={{ margin: "0 auto 10px" }} />
                <p>
                  We’ll update this page when a table is ready. Please wait near
                  the entrance.
                </p>
              </div>
            ) : null}
            <p>Keep this page open for updates.</p>
          </>
        )}
        {error && (
          <p className="auto-error" role="alert" style={{ marginTop: 20 }}>
            {error}
          </p>
        )}
        {submitted &&
          missingTicket &&
          (attempt.current?.session_id === door?.session_id ? (
            <button
              className="floor-btn primary"
              disabled={busy || !connected}
              onClick={() => void retry()}
            >
              Retry the same check-in
            </button>
          ) : (
            <button
              className="floor-btn primary"
              disabled={!connected}
              onClick={reset}
            >
              Start a new check-in
            </button>
          ))}
        {ticket && ["departed", "cancelled"].includes(ticket.status) && (
          <button className="floor-btn" onClick={reset}>
            Check in another party
          </button>
        )}
        {!connected && (
          <p className="auto-error" role="status" style={{ marginTop: 20 }}>
            Connecting to the restaurant. Please wait for the connection before
            checking in.
          </p>
        )}
      </section>
      <p className="guest-footnote">
        For accessibility requests, large parties, or a change to your check-in,
        speak with a team member.
      </p>
    </main>
  );
}
