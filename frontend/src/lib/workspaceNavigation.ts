import {
  BarChart3,
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
    description: "The camera spotted people at the door. Add them to the waiting list or dismiss.",
  },
  availability: {
    label: "Table timing",
    description: "When each table is likely to free up.",
  },
  simulation: {
    label: "Try seating plans",
    description: "See what happens to the waiting list if you seat people differently. Nothing changes on the floor.",
  },
  analytics: {
    label: "Reports",
    description: "How busy you were, how long guests waited, and past shifts.",
  },
  policy: {
    label: "Seating rules",
    description: "Choose how the app picks who sits where.",
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
        to: "/floor",
        label: "Floor",
        shortLabel: "Floor",
        icon: LayoutGrid,
      },
      {
        to: "/operations",
        label: operationsViews.staff.label,
        shortLabel: "Tasks",
        icon: ClipboardList,
      },
      {
        to: "/operations?tab=arrivals",
        label: operationsViews.arrivals.label,
        icon: DoorOpen,
      },
      { to: "/supervisor", label: "AI Supervisor", shortLabel: "Supervisor", icon: Brain },
    ],
  },
  {
    label: "Planning & reports",
    items: [
      {
        to: "/operations?tab=availability",
        label: operationsViews.availability.label,
        icon: Clock3,
      },
      {
        to: "/operations?tab=simulation",
        label: operationsViews.simulation.label,
        icon: Split,
      },
      {
        to: "/operations?tab=analytics",
        label: operationsViews.analytics.label,
        icon: BarChart3,
      },
      {
        to: "/operations?tab=policy",
        label: operationsViews.policy.label,
        icon: Settings2,
      },
    ],
  },
  {
    label: "Setup",
    items: [
      { to: "/videos", label: "Videos", icon: Video },
      { to: "/live", label: "Live camera", icon: MonitorPlay },
      { to: "/setup", label: "Draw tables", icon: PenLine },
    ],
  },
];
