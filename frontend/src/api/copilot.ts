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
  note: string;
};
export type Party = {
  id: string;
  name: string;
  size: number;
  arrived_at: number;
  status: string;
  table_id: string | null;
};
export type Recommendation = {
  party_id: string;
  party_name: string;
  table_id: string;
  table_name: string;
  explanation: string;
  unused_seats: number;
  version: number;
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
export type FloorState = {
  policy: {
    strategy: "fairness" | "balanced" | "throughput";
    max_wait_minutes: number;
    check_in_minutes: number;
  };
  staff: { id: string; name: string; role: string }[];
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
    session_id: number;
  };
};

export async function floorRequest<T = FloorState>(
  path = "",
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    apiUrl(`/api/copilot${path}`),
    body === undefined && method === "POST"
      ? undefined
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Please check the form and try again.",
    );
  return data as T;
}
