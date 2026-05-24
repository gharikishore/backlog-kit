"use client";
import { useBacklogUI } from "./kit-adapter";
import { ACTION_LABELS, STATE_FLIP_ACTIONS, STATE_TONE } from "./constants";
import type { HistoryEntry, Item } from "../../types/backlog";

// Audit log timeline rendered on each expanded backlog card. Pulls
// entries from /api/admin/backlog/[id]/history and groups them by
// day-bucket; each entry renders its action label, actor, and a
// before→after field diff. Reasoning + summary diffs get their own
// styled block via ReasoningDiff.
//
// Extracted from src/app/admin/backlog/page.tsx (intake #165).

function labelForAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const tail = action.replace(/^intake\./, "");
  return tail.charAt(0).toUpperCase() + tail.slice(1).replace(/[._]/g, " ");
}

// Day-bucket header for grouping entries chronologically. "Today" /
// "Yesterday" for the two most recent days; absolute date otherwise.
function dayBucket(at: string, now: Date = new Date()): string {
  const d = new Date(at);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function HistoryTimeline({ entries }: { entries: HistoryEntry[] }) {
  // Entries arrive newest-first; group consecutive same-day entries
  // together. We don't sort — the desc(at) order from the API is
  // exactly what we want.
  const groups: { day: string; entries: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const day = dayBucket(e.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-50 mb-2">{g.day}</div>
          <ul className="space-y-3">
            {g.entries.map((h) => <HistoryEntryRow key={h.id} entry={h} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function HistoryEntryRow({ entry: h }: { entry: HistoryEntry }) {
  const { labelForUser } = useBacklogUI();
  const time = new Date(h.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const label = labelForAction(h.action);
  const stateForFlip: Item["state"] | null = STATE_FLIP_ACTIONS.has(h.action)
    ? (h.action.slice("intake.".length) as Item["state"])
    : null;
  const tone = stateForFlip ? STATE_TONE[stateForFlip] : null;
  // Name-agnostic identity — adapter resolves handle-or-role from the
  // actor metadata, never falling through to email / displayName.
  const actor =
    labelForUser({
      publicHandle: h.actorHandle,
      domainRole: h.actorDomainRole,
      systemRole: h.actorSystemRole,
    }) || "system";
  // Any free-form metadata note worth surfacing (reason, notes — both
  // strings written by various code paths into audit_log.metadata).
  const note =
    h.metadata && typeof h.metadata.notes === "string" ? (h.metadata.notes as string) :
    h.metadata && typeof h.metadata.reason === "string" ? (h.metadata.reason as string) :
    null;
  return (
    <li className="text-[11px] leading-relaxed">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-55 w-14 flex-shrink-0">{time}</span>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded"
          style={tone
            ? { color: tone.fg, backgroundColor: tone.bg }
            : { color: "#C5421B", backgroundColor: "rgba(197, 66, 27, 0.08)" }}
        >
          {label}
        </span>
        <span className="opacity-50 text-[10px]">— {actor}</span>
      </div>
      <FieldDiff entry={h} />
      {note && <div className="mt-1 ml-16 italic opacity-65">&quot;{note}&quot;</div>}
    </li>
  );
}

function FieldDiff({ entry: h }: { entry: HistoryEntry }) {
  // Reorder events carry a priorities map in before/after — too noisy to
  // render field-by-field. Summarise from metadata.reorderedCount.
  if (h.action === "intake.reorder") {
    const count =
      h.metadata && typeof h.metadata.reorderedCount === "number"
        ? (h.metadata.reorderedCount as number)
        : null;
    return count != null ? (
      <div className="mt-1 ml-16 opacity-65">{count} item{count === 1 ? "" : "s"} repositioned</div>
    ) : null;
  }
  // Initial submission rows carry no before/after, only metadata.
  if (/^intake\.(bug|feedback|idea)\.submitted$/.test(h.action)) {
    const pageUrl = h.metadata?.pageUrl;
    return typeof pageUrl === "string" && pageUrl ? (
      <div className="mt-1 ml-16 opacity-60">
        From <span className="font-mono opacity-80">{pageUrl}</span>
      </div>
    ) : null;
  }
  const before = (h.before ?? {}) as Record<string, unknown>;
  const after = (h.after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: { key: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push({ key, before: before[key], after: after[key] });
    }
  }
  if (changes.length === 0) return null;
  return (
    <div className="mt-1 ml-16 space-y-1.5">
      {changes.map((c) => (
        <FieldChange key={c.key} field={c.key} before={c.before} after={c.after} />
      ))}
    </div>
  );
}

function FieldChange({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  if (field === "state") {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 w-16 flex-shrink-0">state</span>
        <StatePill state={before as Item["state"] | null} />
        <span className="opacity-50">→</span>
        <StatePill state={after as Item["state"] | null} />
      </div>
    );
  }
  if (field === "priority") {
    const b = before as number | null;
    const a = after as number | null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 w-16 flex-shrink-0">priority</span>
        <span className="font-mono opacity-80">{b == null ? "—" : b}</span>
        <span className="opacity-50">→</span>
        <span className="font-mono opacity-80">{a == null ? "—" : a}</span>
      </div>
    );
  }
  if (field === "summary") {
    return (
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 mb-1">summary</div>
        <ReasoningDiff before={before as string | null} after={after as string | null} />
      </div>
    );
  }
  if (field === "triageReasoning") {
    return (
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 mb-1">reasoning</div>
        <ReasoningDiff before={before as string | null} after={after as string | null} />
      </div>
    );
  }
  if (field === "shipApprovedAt") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 w-16 flex-shrink-0">ship</span>
        <span className="opacity-75">{after ? "stamped" : "cleared"}</span>
      </div>
    );
  }
  if (field === "decisionChoice") {
    const b = before as string | null;
    const a = after as string | null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 w-16 flex-shrink-0">decision</span>
        <span className="font-mono opacity-80">{b ?? "—"}</span>
        <span className="opacity-50">→</span>
        <span className="font-mono opacity-80">{a ?? "—"}</span>
      </div>
    );
  }
  if (field === "duplicateOfIntakeItemId") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 w-16 flex-shrink-0">duplicate</span>
        <span className="opacity-75">{after ? "linked" : "unlinked"}</span>
      </div>
    );
  }
  if (field === "blockStatus") {
    // Intake #195: park/unpark and block/unblock both flow through this
    // field. Render the transition as "—" → "parked" so a clear is
    // visible as a transition, not a missing entry.
    const b = (before as string | null) ?? null;
    const a = (after as string | null) ?? null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 w-16 flex-shrink-0">block</span>
        <span className="font-mono opacity-80">{b ?? "—"}</span>
        <span className="opacity-50">→</span>
        <span className="font-mono opacity-80">{a ?? "—"}</span>
      </div>
    );
  }
  if (field === "blockedByIntakeItemId") {
    // Just signals whether the pointer was set or cleared — the seq #
    // itself isn't carried in the audit snapshot. Paired with the
    // blockStatus row this is enough to tell the story.
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50 w-16 flex-shrink-0">blocker</span>
        <span className="opacity-75">{after ? "linked" : "unlinked"}</span>
      </div>
    );
  }
  return (
    <div className="font-mono text-[10px] opacity-70">
      <span className="opacity-60">{field}:</span> {formatVal(before)} → {formatVal(after)}
    </div>
  );
}

function StatePill({ state }: { state: Item["state"] | null }) {
  if (!state) return <span className="opacity-50 italic font-mono text-[10px]">—</span>;
  const tone = STATE_TONE[state];
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded"
      style={{ color: tone.fg, backgroundColor: tone.bg }}
    >
      {tone.label}
    </span>
  );
}

function ReasoningDiff({ before, after }: { before: string | null; after: string | null }) {
  // Single block when one side is empty — adding or clearing reasoning,
  // not a true edit. Keeps visual weight balanced.
  if (!before && after) {
    return (
      <div
        className="rounded p-2 text-[11px] whitespace-pre-wrap"
        style={{ backgroundColor: "rgba(34, 102, 51, 0.07)", color: "#226633" }}
      >
        {after}
      </div>
    );
  }
  if (before && !after) {
    return (
      <div
        className="rounded p-2 text-[11px] whitespace-pre-wrap line-through opacity-60"
        style={{ backgroundColor: "rgba(122, 31, 31, 0.06)" }}
      >
        {before}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div
        className="rounded p-2 text-[11px] whitespace-pre-wrap line-through opacity-65"
        style={{ backgroundColor: "rgba(122, 31, 31, 0.06)" }}
      >
        {before ?? ""}
      </div>
      <div
        className="rounded p-2 text-[11px] whitespace-pre-wrap"
        style={{ backgroundColor: "rgba(34, 102, 51, 0.07)", color: "#226633" }}
      >
        {after ?? ""}
      </div>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 38) + "…" : v;
  return JSON.stringify(v);
}
