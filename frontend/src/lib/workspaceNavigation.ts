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
    label: "Arrivals",
    description: "Review arrivals before adding parties to the queue.",
  },
  availability: {
    label: "Availability",
    description: "See when tables may be ready for the next party.",
  },
  simulation: {
    label: "What-if lab",
    description: "Compare seating choices before changing the floor.",
  },
  analytics: {
    label: "Analytics",
    description: "Review service activity and past shifts.",
  },
  policy: {
    label: "Policies",
    description: "Set the rules for seating, wait estimates, and staff checks.",
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
    label: "On shift",
    items: [
      {
        to: "/floor",
        label: "Floor overview",
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
      { to: "/supervisor", label: "Supervisor", icon: Brain },
    ],
  },
  {
    label: "Planning",
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
    label: "Camera setup",
    items: [
      { to: "/videos", label: "Video library", icon: Video },
      { to: "/live", label: "Vision monitor", icon: MonitorPlay },
      { to: "/setup", label: "Table setup", icon: PenLine },
    ],
  },
];
