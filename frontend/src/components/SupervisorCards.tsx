import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, ArrowRight, RefreshCw } from "lucide-react";
import type { FloorState } from "../api/copilot";
import {
  proposalLabel,
  supervisorRequest,
  type AdviceResult,
  type Evidence,
  type SupervisorState,
} from "../api/supervisor";

export function EvidenceList({ items }: { items: Evidence[] }) {
  const groups = new Map<string, Evidence[]>();
  for (const item of items)
    groups.set(item.source_id, [...(groups.get(item.source_id) ?? []), item]);
  return (
    <div className="memory-evidence">
      {items.length === 0 ? (
        <p>No relevant active memory was retrieved.</p>
      ) : (
        [...groups.values()].map((facts) => {
          const source = facts[0];
          return (
            <details key={source.source_id}>
              <summary>
                {source.kind.replaceAll("_", " ")} ·{" "}
                {new Date(source.recorded_at).toLocaleString()} · {facts.length}{" "}
                recalled facts
              </summary>
              {facts.map((fact) => (
                <p key={fact.id}>{fact.text}</p>
              ))}
              <small>
                {source.source.replaceAll("_", " ")} · {source.qualification}
              </small>
              <p className="memory-id">
                One source experience: {source.source_id}
              </p>
              <p className="memory-id">
                Memory IDs: {facts.map((fact) => fact.id).join(", ")}
              </p>
            </details>
          );
        })
      )}
    </div>
  );
}

export function AdviceCards({
  advice,
  stale = false,
  onChanged,
  floor,
}: {
  advice: AdviceResult;
  stale?: boolean;
  onChanged: () => void;
  floor?: FloorState | null;
}) {
  const [busy, setBusy] = useState(false);
  const [acted, setActed] = useState(false);
  const [error, setError] = useState("");
  const decide = async (candidate_id: string, accepted: boolean) => {
    setBusy(true);
    setError("");
    try {
      await supervisorRequest(`/advice/${advice.id}/decision`, {
        candidate_id,
        accepted,
      });
      setActed(true);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="memory-advice">
      <p>{advice.summary}</p>
      {(stale || acted) && (
        <p role="status" className="memory-warning">
          State changed. Refresh advice before approving another action.
        </p>
      )}
      {advice.proposals.map((p) => (
        <article key={p.id} className="memory-proposal">
          <h3>{proposalLabel(p)}</h3>
          {p.party_id && (
            <p>
              <b>
                {floor?.parties.find((party) => party.id === p.party_id)
                  ?.name || "Waiting party"}
              </b>{" "}
              ·{" "}
              {floor?.parties.find((party) => party.id === p.party_id)?.size ??
                "?"}{" "}
              guests <small>Party {p.party_id}</small>
            </p>
          )}
          <p>{p.reason}</p>
          {p.task_id && (
            <small>
              {floor?.tasks
                .find((t) => t.id === p.task_id)
                ?.kind.replaceAll("_", " ")}{" "}
              · {floor?.tasks.find((t) => t.id === p.task_id)?.table_id} · Task{" "}
              {p.task_id}
              {p.staff_id
                ? ` → ${floor?.staff.find((s) => s.id === p.staff_id)?.name || p.staff_id}`
                : ""}
            </small>
          )}
          <small>
            {p.memory_ids.length
              ? `${p.memory_ids.length} cited memories`
              : "Current operational state"}{" "}
            · Agent interpretation
          </small>
          {p.type !== "no_action" && (
            <div className="ops-actions">
              <button
                className="floor-btn primary"
                disabled={busy || stale || acted || p.status !== "proposed"}
                onClick={() => void decide(p.id, true)}
              >
                Approve {p.type === "seat_party" ? "seating" : "task action"}
              </button>
              <button
                className="floor-btn"
                disabled={busy || stale || acted || p.status !== "proposed"}
                onClick={() => void decide(p.id, false)}
              >
                Decline
              </button>
            </div>
          )}
        </article>
      ))}
      {error && (
        <p className="memory-warning" role="alert">
          {error}
        </p>
      )}
      <EvidenceList items={advice.evidence} />
      {advice.without_memory && (
        <details className="memory-comparison">
          <summary>Same floor without memory</summary>
          <p>{advice.without_memory.summary}</p>
          {advice.without_memory.proposals.map((p) => (
            <p key={p.id}>
              <b>{proposalLabel(p)}</b> — {p.reason}
            </p>
          ))}
          <small>
            Same model, question, candidates and current context; memory
            evidence removed. Comparison actions cannot be approved.
          </small>
        </details>
      )}
    </div>
  );
}

export default function SupervisorCards({
  floor,
}: {
  floor: FloorState | null;
}) {
  const floorVersion = floor?.version;
  const sessionId = floor?.session_id;
  const [state, setState] = useState<SupervisorState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const value = await supervisorRequest<SupervisorState>();
      if (id === sequence.current) {
        setState(value);
        setError("");
      }
    } catch {
      if (id === sequence.current) setError("Supervisor is unreachable.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      clearInterval(timer);
      ++sequence.current;
    };
  }, [refresh, floorVersion, sessionId]);
  const generate = async () => {
    setBusy(true);
    setError("");
    ++sequence.current;
    try {
      await supervisorRequest("/advice", {});
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Advice unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const configured =
    state?.integration.memory_configured &&
    state.integration.reasoner_configured;
  return (
    <section className="floor-panel memory-panel">
      <div className="panel-title">
        <div>
          <Brain size={18} />
          <h2>Shift memory</h2>
          <small>
            {state?.integration.memory_profile === "local"
              ? "Local Docker"
              : "Cloud"}
          </small>
        </div>
        <Link to="/supervisor" aria-label="Open Supervisor">
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <p className="decision-intro">
        The next shift benefits from what the last shift learned.
      </p>
      {!configured ? (
        <p>
          Memory advice awaits service setup.{" "}
          <Link to="/supervisor">Open Supervisor</Link> to record experience and
          see setup status.
        </p>
      ) : (
        <>
          <button
            className="floor-btn"
            disabled={busy || state?.integration.generating}
            onClick={() => void generate()}
          >
            <RefreshCw size={13} /> Refresh advice
          </button>
          {state?.advice ? (
            <AdviceCards
              key={state.advice.id}
              advice={state.advice}
              floor={floor}
              stale={
                state.advice.stale ||
                state.advice.token[1] !== floorVersion ||
                state.advice.token[0] !== sessionId
              }
              onChanged={() => void refresh()}
            />
          ) : (
            <p>
              Record experience, then ask for advice. Relevant retained memories
              also trigger proactive cards when the floor changes.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="memory-warning">
          {error}
        </p>
      )}
    </section>
  );
}
