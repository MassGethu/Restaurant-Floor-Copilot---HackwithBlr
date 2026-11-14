import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, ArrowRight, RefreshCw } from "lucide-react";
import type { FloorState } from "../api/copilot";
import {
  proposalLabel,
  supervisorRequest,
  type AdviceResult,
  type Evidence,
  type Proposal,
  type SupervisorState,
} from "../api/supervisor";

const kindLabels: Record<string, string> = {
  correction: "Manager lesson",
  outcome: "What happened",
  action: "Staff decision",
  task_outcome: "Task result",
  environment_update: "Change on the floor",
};
export const kindLabel = (kind: string) =>
  kindLabels[kind] ?? kind.replaceAll("_", " ");
/** Hindsight facts end with "| When: … | Where: …"; keep the readable part. */
const factText = (text: string) => text.split(" | ")[0];
const shortDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function EvidenceList({ items }: { items: Evidence[] }) {
  const groups = new Map<string, Evidence[]>();
  for (const item of items)
    groups.set(item.source_id, [...(groups.get(item.source_id) ?? []), item]);
  return (
    <div className="memory-evidence">
      <h4>What it remembered</h4>
      {items.length === 0 ? (
        <p>No past lessons matched this situation.</p>
      ) : (
        [...groups.values()]
          .sort(
            (a, b) =>
              Number(b.some((f) => f.text.includes("instead of"))) -
              Number(a.some((f) => f.text.includes("instead of"))) ||
              Number(b[0].kind === "correction") -
              Number(a[0].kind === "correction"),
          )
          .map((facts) => {
          const source = facts[0];
          return (
            <details key={source.source_id}>
              <summary>
                <b>{kindLabel(source.kind)}</b> · {shortDate(source.recorded_at)}
                <span>{factText(facts[0].text)}</span>
              </summary>
              {facts.slice(1).map((fact) => (
                <p key={fact.id}>{factText(fact.text)}</p>
              ))}
              <small>{source.qualification}</small>
              <p className="memory-id" title={facts.map((f) => f.id).join(", ")}>
                Source record {source.source_id.slice(0, 8)}
              </p>
            </details>
          );
        })
      )}
    </div>
  );
}

function friendlyLabel(p: Proposal, floor?: FloorState | null): string {
  const party = floor?.parties.find((x) => x.id === p.party_id);
  const table = floor?.tables.find((t) => t.id === p.table_id);
  const task = floor?.tasks.find((t) => t.id === p.task_id);
  const taskTable = floor?.tables.find((t) => t.id === task?.table_id);
  switch (p.type) {
    case "seat_party":
      return `Seat ${party ? `${party.name} (${party.size})` : "the waiting party"} at ${table?.name ?? p.table_id}`;
    case "prioritize_task":
      return `Do the ${task?.kind.replaceAll("_", " ") ?? ""} at ${taskTable?.name ?? task?.table_id ?? "this table"} first`;
    case "assign_task":
      return `Give the ${task?.kind.replaceAll("_", " ") ?? "task"} to ${floor?.staff.find((s) => s.id === p.staff_id)?.name ?? "a staff member"}`;
    default:
      return proposalLabel(p);
  }
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
  const withMemory = advice.proposals[0];
  const withoutMemory = advice.without_memory?.proposals[0];
  return (
    <div className="memory-advice">
      {withMemory && withoutMemory && (
        <div className="memory-compare" aria-label="Advice with and without memory">
          <div className="without">
            <small>Without memory</small>
            <b>{friendlyLabel(withoutMemory, floor)}</b>
            <p>{withoutMemory.reason}</p>
          </div>
          <div className="arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </div>
          <div className="with">
            <small>With past lessons</small>
            <b>{friendlyLabel(withMemory, floor)}</b>
            <p>{withMemory.reason}</p>
          </div>
        </div>
      )}
      <p className="memory-summary">{advice.summary}</p>
      {(stale || acted) && (
        <p role="status" className="memory-warning">
          {acted
            ? "Done. Ask again for the next piece of advice."
            : "The floor has changed since this advice. Ask again for fresh advice."}
        </p>
      )}
      {advice.proposals.map((p) => (
        <article key={p.id} className="memory-proposal">
          <span className={`memory-tag ${p.memory_ids.length ? "learned" : ""}`}>
            {p.memory_ids.length
              ? `Uses ${p.memory_ids.length} past lesson${p.memory_ids.length === 1 ? "" : "s"}`
              : "Based on the floor right now"}
          </span>
          <h3>{friendlyLabel(p, floor)}</h3>
          <p>{p.reason}</p>
          {p.type !== "no_action" && (
            <div className="ops-actions">
              <button
                className="floor-btn primary"
                disabled={busy || stale || acted || p.status !== "proposed"}
                onClick={() => void decide(p.id, true)}
              >
                Do it
              </button>
              <button
                className="floor-btn"
                disabled={busy || stale || acted || p.status !== "proposed"}
                onClick={() => void decide(p.id, false)}
              >
                No thanks
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
          <summary>Full answer without memory</summary>
          <p>{advice.without_memory.summary}</p>
          <small>
            Same AI, same question, same floor, with past lessons removed. This
            is for comparison only and can’t be approved.
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
          <h2>AI Supervisor</h2>
          <small>
            {state?.integration.memory_profile === "local"
              ? "Memory: local"
              : "Memory: cloud"}
          </small>
        </div>
        <Link to="/supervisor" aria-label="Open Supervisor">
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <p className="decision-intro">
        Remembers what worked on past shifts and suggests what to do.
      </p>
      {!configured ? (
        <p>
          Memory isn’t connected yet.{" "}
          <Link to="/supervisor">Open the AI Supervisor</Link> to set it up.
        </p>
      ) : (
        <>
          <button
            className="floor-btn"
            disabled={busy || state?.integration.generating}
            onClick={() => void generate()}
          >
            <RefreshCw size={13} /> {busy || state?.integration.generating ? "Thinking…" : "Ask for advice"}
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
              Ask for advice when you’re unsure who to seat or what to do next.
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
