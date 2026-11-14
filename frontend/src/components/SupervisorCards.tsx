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
  space_note: "Space check",
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
      {items.length === 0 ? (
        <p>No past lessons matched this situation.</p>
      ) : (
        [...groups.values()].map((facts) => {
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
  onAskAgain,
  asking = false,
}: {
  advice: AdviceResult;
  stale?: boolean;
  onChanged: () => void;
  floor?: FloorState | null;
  onAskAgain?: () => void;
  asking?: boolean;
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
  // The facts the AI actually cited, manager lessons first.
  const citedIds = new Set(advice.proposals.flatMap((p) => p.memory_ids));
  const cited = advice.evidence
    .filter((e) => citedIds.has(e.id))
    .sort(
      (x, y) =>
        Number(y.kind === "correction") - Number(x.kind === "correction"),
    );
  const lesson = cited[0];
  const alsoUsed = [
    ...new Set(cited.slice(1).map((e) => factText(e.text))),
  ].filter((text) => text !== factText(lesson?.text ?? ""));
  const others = advice.evidence.filter((e) => !citedIds.has(e.id));
  const locked = busy || stale || acted;
  const decisionButtons = (p: Proposal) =>
    p.type !== "no_action" && (
      <div className="ops-actions">
        <button
          className="floor-btn primary"
          disabled={locked || p.status !== "proposed"}
          onClick={() => void decide(p.id, true)}
        >
          Do it
        </button>
        <button
          className="floor-btn"
          disabled={locked || p.status !== "proposed"}
          onClick={() => void decide(p.id, false)}
        >
          No thanks
        </button>
      </div>
    );
  return (
    <div className="memory-advice">
      {withMemory && withoutMemory ? (
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
      ) : withMemory ? (
        <article className="memory-proposal is-hero">
          <span
            className={`memory-tag ${withMemory.memory_ids.length ? "learned" : ""}`}
          >
            {withMemory.memory_ids.length
              ? "Uses past lessons"
              : "Based on the floor right now"}
          </span>
          <h3>{friendlyLabel(withMemory, floor)}</h3>
          <p>{withMemory.reason}</p>
        </article>
      ) : (
        <p className="memory-summary">{advice.summary}</p>
      )}

      {lesson && (
        <div className="memory-lesson">
          <small>Because of this lesson</small>
          <blockquote>“{factText(lesson.text)}”</blockquote>
          <span>
            {kindLabel(lesson.kind)} · {shortDate(lesson.recorded_at)} · Saved
            to memory
          </span>
          {alsoUsed.length > 0 && (
            <ul>
              {alsoUsed.slice(0, 3).map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(stale || acted) && (
        <p role="status" className="memory-warning">
          {acted
            ? "Done. Ask again for the next piece of advice."
            : "The floor has changed since this advice. Ask again for fresh advice."}
        </p>
      )}
      <div className="memory-actions">
        {withMemory && decisionButtons(withMemory)}
        {onAskAgain && (
          <button
            className="floor-btn"
            disabled={asking}
            onClick={onAskAgain}
          >
            <RefreshCw size={13} /> {asking ? "Thinking…" : "Ask again"}
          </button>
        )}
      </div>
      {advice.proposals.slice(1).map((p) => (
        <article key={p.id} className="memory-proposal">
          <h3>Also: {friendlyLabel(p, floor)}</h3>
          <p>{p.reason}</p>
          {decisionButtons(p)}
        </article>
      ))}
      {error && (
        <p className="memory-warning" role="alert">
          {error}
        </p>
      )}
      {others.length > 0 && (
        <details className="memory-more">
          <summary>
            {others.length} other thing{others.length === 1 ? "" : "s"} it
            remembered
          </summary>
          <EvidenceList items={others} />
        </details>
      )}
      {advice.without_memory && (
        <details className="memory-more">
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

/**
 * Floor-page hint: appears only when the AI Supervisor, using a past lesson,
 * suggests a different table from the simple seating rules. The full
 * comparison and the lesson live on the AI Supervisor page.
 */
export default function SupervisorHint({
  floor,
}: {
  floor: FloorState | null;
}) {
  const [state, setState] = useState<SupervisorState | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const value = await supervisorRequest<SupervisorState>();
      if (id === sequence.current) setState(value);
    } catch {
      // The hint is optional; the Floor keeps working without it.
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

  // While the AI is thinking, tell the host a second opinion is coming.
  if (
    state?.integration.generating &&
    floor?.parties.some((x) => x.status === "waiting")
  )
    return (
      <p className="supervisor-hint-checking" role="status">
        <Brain size={15} aria-hidden="true" />
        AI Supervisor is checking past lessons…
      </p>
    );
  const advice = state?.advice;
  if (!advice || advice.stale || !floor || advice.token[0] !== floor.session_id)
    return null;
  const proposal = advice.proposals.find(
    (p) =>
      p.type === "seat_party" &&
      p.status === "proposed" &&
      p.memory_ids.length > 0 &&
      floor.parties.some((x) => x.id === p.party_id && x.status === "waiting") &&
      floor.tables.some((t) => t.id === p.table_id && t.seating_eligible),
  );
  if (!proposal) return null;
  const rule = floor.recommendations.find(
    (r) => r.party_id === proposal.party_id,
  );
  if (rule && rule.table_id === proposal.table_id) return null;
  const table = floor.tables.find((t) => t.id === proposal.table_id);
  const party = floor.parties.find((x) => x.id === proposal.party_id);
  const lesson = advice.evidence.find(
    (e) => proposal.memory_ids.includes(e.id) && e.kind === "correction",
  ) ?? advice.evidence.find((e) => proposal.memory_ids.includes(e.id));
  return (
    <Link to="/supervisor#advice" className="supervisor-hint">
      <span className="supervisor-hint-icon">
        <Brain size={18} aria-hidden="true" />
      </span>
      <span>
        <strong>
          AI Supervisor suggests {table?.name ?? proposal.table_id}
          {rule ? " instead" : ""}
          {party ? ` for ${party.name}` : ""}
        </strong>
        <small>
          {lesson ? `Based on a past lesson: ${factText(lesson.text)}` : "Based on a past lesson"}
        </small>
      </span>
      <span className="supervisor-hint-cta">
        See why <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}
