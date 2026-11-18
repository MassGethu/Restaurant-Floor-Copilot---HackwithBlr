import { apiUrl } from "./client";

export type FloorTable = {
  id: string;
  name: string;
  capacity: number;
  status: "ready" | "occupied" | "cleaning_required" | "needs_verification";
  observed: string;
  people_count: number;
  occupied_since: number | null;
  duration_known: boolean;
  manual_hold: boolean;
  hold_until?: number | null;
  seating_eligible: boolean;
  departure_review: boolean;
  blocked: boolean;
  table_key: string;
  party_id: string | null;
  note: string;
};
export type Party = {
  id: string;
  name: string;
  size: number;
  arrived_at: number;
  status: string;
  table_id: string | null;
  arrival_confirmed?: boolean;
};
export type Recommendation = {
  party_id: string;
  party_name: string;
  table_id: string;
  table_name: string;
  explanation: string;
  unused_seats: number;
  version: number;
  decision_key: string;
  alternatives: {
    table_id: string;
    table_name: string;
    capacity: number;
    unused_seats: number;
    other_parties_seatable_now: number;
    other_guests_seatable_now: number;
    displaced_party_names: string[];
  }[];
};
export type ChairMemory =
  | { status: "none" | "checking" | "unavailable" }
  | {
      status: "found";
      max_extra_chairs: number;
      recorded_at: string;
      source_id: string;
      fact_id: string | null;
      text: string;
    };

export type ExtraChairOption = {
  party_id: string;
  party_name: string;
  party_size: number;
  table_id: string;
  table_name: string;
  capacity: number;
  extra_chairs: number;
  /** True when the party also has a normal table: this is just another choice. */
  alternative: boolean;
  version: number;
  /** What Hindsight recalled about extra chairs at this table. */
  memory: ChairMemory;
};

export type FloorState = {
  automation: {
    acknowledgement_timeout_seconds?: number;
    enabled: boolean;
    paused: boolean;
    departure_seconds: number;
    task_timeout_seconds: number;
    seating_timeout_seconds: number;
    max_tasks_per_staff: number;
    actions: number;
    last_tick_at: number | null;
    last_error: string | null;
  };
  exceptions: {
    id: string;
    key: string;
    title: string;
    detail: string;
    severity: "warning" | "critical";
    status: "open" | "acknowledged" | "resolved";
    created_at: number;
    resolved_at: number | null;
    table_id?: string;
    task_id?: string;
    party_id?: string;
  }[];
  automation_log: {
    id: string;
    kind: string;
    explanation: string;
    scenario_time: number;
    recorded_at: number;
    table_id?: string;
    party_id?: string;
    evidence?: { source_id: string; fact_id: string; reason: string } | null;
  }[];
  staff_mode: boolean;
  service_epoch: number | null;
  policy: {
    strategy: "fairness" | "balanced" | "throughput";
    max_wait_minutes: number;
    check_in_minutes: number;
  };
  staff: { id: string; name: string; role: string; available?: boolean }[];
  tasks: {
    id: string;
    table_id: string;
    priority: "normal" | "high";
    kind: string;
    source: string;
    note: string;
    role: string;
    status: string;
    assigned_to: string | null;
    created_at: number;
    completed_at: number | null;
    party_id?: string;
    assignment_origin?: string;
    assignment_revision?: number;
    problem?: string;
  }[];
  arrivals: {
    id: string;
    observed_at: number;
    observed_people: number;
    status: string;
    note: string;
  }[];
  availability: {
    table_id: string;
    name: string;
    capacity: number;
    min_minutes: number | null;
    max_minutes: number | null;
    reason: string;
  }[];
  analytics: {
    parties_seated: number;
    guests_seated: number;
    average_wait_minutes: number | null;
    longest_wait_minutes: number;
    total_capacity: number;
    occupied_capacity: number;
    tasks_completed: number;
    manual_overrides: number;
    trend: {
      minute: number;
      occupied: number;
      ready: number;
      cleaning: number;
      waiting: number;
    }[];
    completed_sessions: {
      table_id: string;
      duration_seconds: number;
      duration_known: boolean;
    }[];
    history: {
      session_id: string;
      video_id: string;
      now: number;
      parties: Party[];
    }[];
  };
  video_id: string | null;
  version: number;
  now: number;
  session_id: string;
  tables: FloorTable[];
  parties: Party[];
  source_status: string;
  model_state: string;
  observations_fresh: boolean;
  recommendations: Recommendation[];
  /** Parties no free table fits, with a table that fits with 1–2 extra chairs. */
  extra_chair_options: ExtraChairOption[];
  events: { id: string; text: string; origin: string; scenario_time: number }[];
  cleaning_priorities: {
    table_id: string;
    table_name: string;
    explanation: string;
  }[];
  wait_estimates: Record<
    string,
    { min_minutes: number | null; max_minutes: number | null; note: string }
  >;
  assumptions: {
    dining_min: number;
    dining_max: number;
    cleaning_min: number;
    cleaning_max: number;
  };
  playback: {
    video_id: string | null;
    paused: boolean;
    ended: boolean;
    position_seconds: number;
    processing_fps: number;
    inference_fresh: boolean;
    source_frozen: boolean;
    is_file: boolean;
    session_id: number;
  };
};

export class FloorRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "FloorRequestError";
  }
}

export async function floorRequest<T = FloorState>(
  path = "",
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(apiUrl(`/api/copilot${path}`), {
    signal: AbortSignal.timeout(12_000),
    ...(body === undefined && method === "POST"
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new FloorRequestError(
      typeof data.detail === "string"
        ? data.detail
        : "Please check the form and try again.",
      response.status,
    );
  return data as T;
}
