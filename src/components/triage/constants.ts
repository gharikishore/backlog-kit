import type { ComponentType } from "react";
import { Bug, MessageSquare, Lightbulb, Layers, UserPlus, Building2 } from "lucide-react";
import type { Item, KindFilter, SortMode, StateFilter } from "../../types/backlog";

// Constants shared across the admin/backlog triage UI. The
// authoritative iconForKind mapping lives here too (specforge intake
// #910 — single source of truth for kind → icon).

export const INTAKE_KINDS = [
  "bug",
  "feedback",
  "idea",
  "feature",
  "contributor_signup",
  "customer_signup",
] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];

export type KindIcon = ComponentType<{ size?: number | string; className?: string }>;

export const KIND_ICON: Record<string, KindIcon> = {
  bug: Bug,
  feedback: MessageSquare,
  idea: Lightbulb,
  feature: Layers,
  contributor_signup: UserPlus,
  customer_signup: Building2,
};

/** Safe lookup with a Lightbulb fallback — never returns undefined. */
export function iconForKind(kind: string | null | undefined): KindIcon {
  if (!kind) return Lightbulb;
  return KIND_ICON[kind] ?? Lightbulb;
}

export const SORT_LABELS: Record<SortMode, string> = {
  default: "Default (state, priority)",
  priority: "Priority (lowest first)",
  newest: "Newest first (#)",
  oldest: "Oldest first (#)",
  recent: "Recently updated",
};

export const SORT_BUTTON_LABEL: Record<SortMode, string> = {
  default: "default",
  priority: "priority",
  newest: "newest",
  oldest: "oldest",
  recent: "recent",
};

// State badge color map (8 buckets — finer than the 5-tone Lozenge palette).
export const STATE_TONE: Record<Item["state"], { fg: string; bg: string; label: string }> = {
  pending:        { fg: "#7a4f1f", bg: "rgba(122, 79, 31, 0.08)",  label: "Pending" },
  accepted:       { fg: "#226633", bg: "rgba(34, 102, 51, 0.08)",  label: "Accepted" },
  ready_to_ship:  { fg: "#C5421B", bg: "rgba(197, 66, 27, 0.10)",  label: "Ready to ship" },
  shipped:        { fg: "#1a3a78", bg: "rgba(26, 58, 120, 0.08)",  label: "Shipped" },
  requested:      { fg: "#7a4f1f", bg: "rgba(122, 79, 31, 0.08)",  label: "Requested" },
  provisioned:    { fg: "#1a3a78", bg: "rgba(26, 58, 120, 0.08)",  label: "Provisioned" },
  declined:       { fg: "#7a1f1f", bg: "rgba(122, 31, 31, 0.08)",  label: "Declined" },
  duplicate:      { fg: "#7a766f", bg: "rgba(122, 118, 111, 0.08)", label: "Duplicate" },
};

export const SIGNUP_KINDS = new Set<KindFilter>(["contributor_signup", "customer_signup"]);

export const SIGNUP_STATE_FILTERS: ReadonlyArray<StateFilter> = [
  "active", "all", "requested", "provisioned", "declined", "duplicate",
];

export const GENERIC_STATE_FILTERS: ReadonlyArray<StateFilter> = [
  "active", "all", "pending", "accepted", "ready_to_ship", "shipped",
  "parked", "blocked",
  "declined", "duplicate",
];

export const KIND_FILTER_TONE: Record<KindFilter, "default" | "success" | "danger" | "orange" | "navy" | "gold" | "muted"> = {
  all: "default",
  bug: "danger",
  feedback: "navy",
  idea: "gold",
  contributor_signup: "success",
  customer_signup: "orange",
};

export const STATE_FILTER_TONE: Record<StateFilter, "default" | "success" | "danger" | "orange" | "navy" | "gold" | "muted"> = {
  active: "default",
  all: "default",
  pending: "gold",
  accepted: "success",
  ready_to_ship: "orange",
  shipped: "navy",
  parked: "muted",
  blocked: "danger",
  requested: "gold",
  provisioned: "navy",
  declined: "danger",
  duplicate: "muted",
};

export const SUMMARY_MAX_CHARS = 140;

export const INTAKE_CATEGORIES = [
  "Design",
  "Legal",
  "Tooling",
  "Compliance",
  "Data",
  "SAPPS",
  "Strategy",
] as const;
export type IntakeCategory = (typeof INTAKE_CATEGORIES)[number];
export type CategoryFilter = "all" | "uncategorised" | IntakeCategory;

export const ACTION_LABELS: Record<string, string> = {
  "intake.pending": "Reopened",
  "intake.accepted": "Accepted",
  "intake.ready_to_ship": "Ready to ship",
  "intake.declined": "Declined",
  "intake.shipped": "Shipped",
  "intake.duplicate": "Marked duplicate",
  "intake.requested": "Reopened (signup)",
  "intake.provisioned": "Provisioned",
  "intake.touched": "Edited",
  "intake.decision_recorded": "Decision recorded",
  "intake.ship_approved": "Ship approved",
  "intake.ship_unapproved": "Ship approval cleared",
  "intake.reorder": "Priorities reordered",
  "intake.bug.submitted": "Bug submitted",
  "intake.feedback.submitted": "Feedback submitted",
  "intake.idea.submitted": "Idea submitted",
  "intake.block_parked": "Parked",
  "intake.block_blocked": "Blocked",
  "intake.block_cleared": "Block cleared",
  "intake.block_auto_cleared": "Auto-unblocked",
};

export const STATE_FLIP_ACTIONS = new Set([
  "intake.pending",
  "intake.accepted",
  "intake.ready_to_ship",
  "intake.declined",
  "intake.shipped",
  "intake.duplicate",
  "intake.requested",
  "intake.provisioned",
]);
