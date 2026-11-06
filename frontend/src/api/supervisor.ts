import { apiUrl } from "./client";

export type ShiftContext = {
  delivery_activity: "unknown" | "normal" | "rush";
  staffing: string;
  note: string;
};
export type Evidence = {
  id: string;
  text: string;
  source_id: string;
  recorded_at: string;
  kind: string;
  source: string;
  qualification: string;
  supports_preference: boolean;
};
export type Proposal = {
  id: string;
  type: "seat_party" | "prioritize_task" | "assign_task" | "no_action";
  party_id?: string;
  table_id?: string;
  task_id?: string;
  staff_id?: string;
  policy_departure?: boolean;
  reason: string;
  memory_ids: string[];
  status: string;
};
export type AdviceResult = {
  id: string;
  created_at: string;
  token: [string, number, number, string];
  question: string;
  summary: string;
  proposals: Proposal[];
  evidence: Evidence[];
  stale?: boolean;
  without_memory: {
    summary: string;
    proposals: Proposal[];
    evidence: Evidence[];
  } | null;
};
export type Experience = {
  id: string;
  kind: string;
  source: string;
  recorded_at: string;
  layout_id: string;
  parent_id: string | null;
  superseded_by: string | null;
  delivery: string;
  error: string | null;
  active: boolean;
  content: {
    note?: string;
    outcome?: string;
    qualification: string;
    accepted?: boolean;
    action?: Proposal;
    baseline_table_id?: string;
    chosen_table_id?: string;
  };
};
export type SupervisorState = {
  restaurant_id: string;
  layout_id: string;
  revision: number;
  shift: {
    id: string;
    label: string;
    context: ShiftContext;
    context_confirmed_at: string | null;
  };
  experiences: Experience[];
  advice: AdviceResult | null;
  integration: {
    memory_configured: boolean;
    reasoner_configured: boolean;
    generating: boolean;
    last_error: string | null;
    pending: number;
    failed: number;
    retained: number;
  };
};
export type Handover = {
  text: string;
  evidence: Evidence[];
  created_at: string;
  token: [string, number, number, string];
  current_tasks: {
    id: string;
    table_id: string;
    kind: string;
    status: string;
    priority: string;
    assigned_to: string | null;
  }[];
};

export async function supervisorRequest<T>(
  path = "",
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(apiUrl(`/api/supervisor${path}`), {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : `Request failed (${response.status}).`,
    );
  }
  return response.json();
}

export function proposalLabel(p: Proposal): string {
  switch (p.type) {
    case "seat_party":
      return `Seat party at ${p.table_id}${p.policy_departure ? " · manager alternative" : " · baseline"}`;
    case "prioritize_task":
      return "Prioritize existing task";
    case "assign_task":
      return "Assign existing task";
    default:
      return "No action needed";
  }
}
