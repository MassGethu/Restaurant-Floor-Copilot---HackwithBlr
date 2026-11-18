import {
  BarChart3,
  Activity,
  Brain,
  ClipboardList,
  Clock3,
  DoorOpen,
  LayoutGrid,
  MonitorPlay,
  PenLine,
  Settings2,
  Split,
  Video,
  type LucideIcon,
} from "lucide-react";

type Destination = {
  to: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
};

export const operationsViews = {
  staff: {
    label: "Staff tasks",
    description: "Assign and track cleaning and service work.",
  },
  arrivals: {
    label: "Door arrivals",
    description:
      "The camera spotted people at the door. Add them to the waiting list or dismiss.",
  },
  availability: {
    label: "Table timing",
    description: "When each table is likely to free up.",
  },
  simulation: {
    label: "Try seating plans",
    description: "Test a different seating choice without changing the floor.",
  },
  analytics: {
    label: "Reports",
    description: "How busy you were, how long guests waited, and past shifts.",
  },
  policy: {
    label: "Seating & wait times",
    description:
      "Who gets seated first, and how long meals and cleaning usually take.",
  },
};

export function operationsView(search: string): keyof typeof operationsViews {
  const tab = new URLSearchParams(search).get("tab");
  return tab && Object.hasOwn(operationsViews, tab)
    ? (tab as keyof typeof operationsViews)
    : "staff";
}

export const navigation: { label: string; items: Destination[] }[] = [
  {
    label: "During service",
    items: [
      {
        to: "/autonomy",
        label: "Service overview",
        shortLabel: "Service",
        icon: Activity,
      },
      { to: "/floor", label: "Floor", icon: LayoutGrid },
      {
        to: "/staff",
        label: "Staff jobs",
        shortLabel: "Tasks",
        icon: ClipboardList,
      },
      {
        to: "/supervisor",
        label: "AI Supervisor",
        shortLabel: "Supervisor",
        icon: Brain,
      },
    ],
  },
  {
    label: "After service",
    items: [
      {
        to: "/operations?tab=analytics",
        label: operationsViews.analytics.label,
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Setup",
    items: [{ to: "/settings", label: "Settings", icon: Settings2 }],
  },
];

/** Pages reached from Settings; the sidebar highlights Settings for them. */
export const settingsPages: {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "Restaurant" | "Camera" | "Planning tools";
}[] = [
  {
    to: "/operations",
    label: "Roster & assignments",
    description: "Manage the team and intervene in task assignments.",
    icon: ClipboardList,
    group: "Restaurant",
  },
  {
    to: "/operations?tab=policy",
    label: operationsViews.policy.label,
    description: operationsViews.policy.description,
    icon: Settings2,
    group: "Restaurant",
  },
  {
    to: "/setup",
    label: "Draw tables",
    description: "Mark where each table is on the camera picture.",
    icon: PenLine,
    group: "Camera",
  },
  {
    to: "/videos",
    label: "Videos",
    description: "Upload or pick the footage the camera uses.",
    icon: Video,
    group: "Camera",
  },
  {
    to: "/live",
    label: "Live camera",
    description: "See what the camera detects at each table.",
    icon: MonitorPlay,
    group: "Camera",
  },
  {
    to: "/operations?tab=arrivals",
    label: operationsViews.arrivals.label,
    description: operationsViews.arrivals.description,
    icon: DoorOpen,
    group: "Planning tools",
  },
  {
    to: "/operations?tab=availability",
    label: operationsViews.availability.label,
    description: operationsViews.availability.description,
    icon: Clock3,
    group: "Planning tools",
  },
  {
    to: "/operations?tab=simulation",
    label: operationsViews.simulation.label,
    description: operationsViews.simulation.description,
    icon: Split,
    group: "Planning tools",
  },
];
