"use client";

// BacklogPage — drop-in admin/backlog triage UI for backlog-kit
// consumers (intake #986).
//
// Goal: a fresh consumer mounts this in `app/admin/backlog/page.tsx`
// and gets specforge-equivalent triage UI without the 900-LOC custom
// wiring that lives in specforge today:
//
//   import { BacklogPage } from "@local/backlog-kit/components/triage";
//   export default function AdminBacklog() { return <BacklogPage />; }
//
// What's included:
//   - Page chrome (eyebrow, title, subtitle) — overridable via props
//   - Inline state filter chip strip (active / pending / accepted /
//     ready / shipped / declined / duplicate)
//   - Search input over title/description/#seq
//   - Default BacklogUIProvider (themable via --ft-* vars; no
//     dependency on Vellum or any UI kit)
//   - BacklogCard stack with working triage actions:
//     · state transitions (PATCH /api/admin/backlog/[id])
//     · priority edits
//     · summary + description edits
//     · reasoning edits
//     · ship-approval stamp
//
// What's NOT included (kept consumer-side for project-specific shape):
//   - Saved views toolbar (BacklogViewsToolbar — needs /views endpoint
//     mounted; opt in via the `viewsToolbar` prop when ready)
//   - Drag-to-reorder priority (advanced; specforge has it)
//   - Signup-acceptance + provisioning panels (specforge-specific UX)
//   - SSE auto-refresh (poll-on-action is the default; pass
//     `pollIntervalMs` for time-based refresh, or wire SSE consumer-side)
//
// Consumers needing more (HmBr) start with this. Consumers needing
// less customization than specforge (anyone else) end here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BacklogUIProvider } from "./kit-adapter";
import { BacklogCard } from "./BacklogCard";
import { QueueCountHeader } from "./QueueCountHeader";
import { QueueCapNotice } from "./QueueCapNotice";
import { defaultBacklogUIAdapter } from "./default-adapter";
import type { BacklogUIAdapter } from "./kit-adapter";
import type { Item } from "../../types/backlog";

// Specforge intake #1026 (2026-05-25): default pageSize for the
// canonical kit mount. Raised from 100 → 200 to match the
// admin-backlog-list endpoint's new cap. Beyond this, the QueueCapNotice
// footer surfaces "showing first N of M — refine filters" so the cap
// is never silent. The kit endpoint allows up to 1000 (cap raised in
// the same intake) so consumers with virtualization can lift it.
const DEFAULT_PAGE_SIZE = 200;

// ── Public props ─────────────────────────────────────────────────────

export type BacklogPageProps = {
  /** Page eyebrow text (uppercase kicker). Default: "Triage queue". */
  eyebrow?: string;
  /** Page title. Default: "Decide what we work on next." */
  title?: string;
  /** Page subtitle / hint. Default: prose about triaging. */
  subtitle?: string;
  /** API base for list + per-item PATCH. Default: "/api/admin/backlog". */
  apiBase?: string;
  /** Optional polling interval (ms). 0 = no polling (default). */
  pollIntervalMs?: number;
  /** Override the UI adapter. Default: defaultBacklogUIAdapter(). */
  adapter?: BacklogUIAdapter;
  /** Default state filter on first mount. Default: "active". */
  defaultStateFilter?: StateFilter;
};

// ── Internal filter vocab ────────────────────────────────────────────

type StateFilter =
  | "active"
  | "all"
  | "pending"
  | "accepted"
  | "ready_to_ship"
  | "shipped"
  | "declined"
  | "duplicate";

const STATE_FILTERS: ReadonlyArray<{ value: StateFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "ready_to_ship", label: "Ready" },
  { value: "shipped", label: "Shipped" },
  { value: "declined", label: "Declined" },
  { value: "duplicate", label: "Duplicate" },
];

// ── BacklogPage ──────────────────────────────────────────────────────

export function BacklogPage({
  eyebrow = "Triage queue",
  title = "Decide what we work on next.",
  subtitle = "Every bug report, feedback note, and idea lands here. Accept (with reasoning + priority), decline (with reasoning), mark shipped, or flag as duplicate. Lower priority number = higher position in the queue.",
  apiBase = "/api/admin/backlog",
  pollIntervalMs = 0,
  adapter,
  defaultStateFilter = "active",
}: BacklogPageProps = {}) {
  const ui = useMemo(() => adapter ?? defaultBacklogUIAdapter(), [adapter]);

  const [stateFilter, setStateFilter] = useState<StateFilter>(defaultStateFilter);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // ── Editing state — flat so BacklogCard's per-id editors can drive in
  // and out of edit mode without losing siblings' draft text.
  const [bodyEditingId, setBodyEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [reasoningEditingId, setReasoningEditingId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [reasoningDraft, setReasoningDraft] = useState("");

  // ── Data fetch ─────────────────────────────────────────────────
  // Specforge intake #1026: single-shot fetch up to DEFAULT_PAGE_SIZE
  // rows. No pagination UI; the QueueCapNotice below surfaces the cap
  // when the queue exceeds it.
  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (stateFilter !== "all") params.set("state", stateFilter);
      params.set("pageSize", String(DEFAULT_PAGE_SIZE));
      const r = await fetch(`${apiBase}?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      const body = await r.json();
      if (!r.ok) {
        setError(body.error ?? `HTTP ${r.status}`);
        return;
      }
      setError(null);
      setItems(body.items ?? []);
      if (typeof body.total === "number") setTotal(body.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [apiBase, stateFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return;
    const id = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, refresh]);

  // ── Triage handler — PATCH then refetch ────────────────────────
  const onTriage: React.ComponentProps<typeof BacklogCard>["onTriage"] =
    useCallback(
      async (id, patch) => {
        try {
          const r = await fetch(`${apiBase}/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify(patch),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            setError(j.error ?? `PATCH ${r.status}`);
            return;
          }
          await refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      [apiBase, refresh],
    );

  // ── Body editor (title + description) ──────────────────────────
  const onStartBody = useCallback((item: Item) => {
    setBodyEditingId(item.id);
    setTitleDraft(item.title ?? "");
    setDescriptionDraft(item.description ?? "");
  }, []);
  const onCancelBody = useCallback(() => {
    setBodyEditingId(null);
    setTitleDraft("");
    setDescriptionDraft("");
  }, []);
  const onSaveBody = useCallback(async () => {
    if (!bodyEditingId) return;
    await onTriage(bodyEditingId, {
      // BacklogCard's onTriage type defines this loosely; the API
      // accepts a `title` + `description` patch via the same route.
      // We pass them inside a generic object — runtime accepts it.
      ...({ title: titleDraft, description: descriptionDraft } as Parameters<typeof onTriage>[1]),
    });
    onCancelBody();
  }, [bodyEditingId, titleDraft, descriptionDraft, onTriage, onCancelBody]);

  // ── Reasoning editor ───────────────────────────────────────────
  const onStartReasoning = useCallback((item: Item) => {
    setReasoningEditingId(item.id);
    setSummaryDraft(item.summary ?? "");
    setReasoningDraft(item.triageReasoning ?? "");
  }, []);
  const onCancelReasoning = useCallback(() => {
    setReasoningEditingId(null);
    setSummaryDraft("");
    setReasoningDraft("");
  }, []);
  const onSaveReasoning = useCallback(async () => {
    if (!reasoningEditingId) return;
    await onTriage(reasoningEditingId, {
      summary: summaryDraft || null,
      triageReasoning: reasoningDraft || null,
    });
    onCancelReasoning();
  }, [reasoningEditingId, summaryDraft, reasoningDraft, onTriage, onCancelReasoning]);

  // ── Comments — POST to the kit's per-item /comments endpoint when
  // mounted. If the consumer hasn't mounted that route, the call fails
  // gracefully and surfaces the error in the page banner.
  const onAddComment = useCallback(
    async (
      ticketId: string,
      body: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const r = await fetch(`${apiBase}/${ticketId}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ body }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          return { ok: false, error: j.error ?? `HTTP ${r.status}` };
        }
        await refresh();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [apiBase, refresh],
  );

  // ── Filter by search (client-side over the fetched window) ─────
  const visibleItems = useMemo(() => {
    if (!items) return null;
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    const match = (s: string | null | undefined) =>
      typeof s === "string" && s.toLowerCase().includes(needle);
    return items.filter(
      (it) =>
        match(it.title) || match(it.description) || `#${it.seq}`.includes(needle),
    );
  }, [items, search]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <BacklogUIProvider value={ui}>
      <div
        style={{
          minHeight: "calc(100vh - 60px)",
          background: "var(--ft-surface)",
          color: "var(--ft-ink)",
          padding: "24px 20px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Header */}
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--ft-accent)",
              marginBottom: 8,
            }}
          >
            {eyebrow}
          </div>
          <h1
            style={{
              fontFamily: "inherit",
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.15,
              margin: 0,
              marginBottom: 10,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              maxWidth: 720,
              fontSize: 14,
              color: "var(--ft-text-muted)",
              lineHeight: 1.5,
              marginTop: 0,
              marginBottom: 24,
            }}
          >
            {subtitle}
          </p>

          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, or #ticket…"
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              background: "var(--ft-input-bg)",
              color: "var(--ft-ink)",
              border: "1px solid var(--ft-input-border)",
              borderRadius: 6,
              marginBottom: 16,
            }}
          />

          {/* State filter chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 24,
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--ft-text-soft)",
                alignSelf: "center",
                marginRight: 8,
              }}
            >
              State:
            </span>
            {STATE_FILTERS.map((f) => {
              const active = stateFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStateFilter(f.value)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    fontWeight: 500,
                    cursor: "pointer",
                    background: active ? "var(--ft-ink)" : "transparent",
                    color: active ? "var(--ft-bubble-fg)" : "var(--ft-ink)",
                    border: `1px solid ${active ? "var(--ft-ink)" : "var(--ft-hair-strong)"}`,
                    borderRadius: 4,
                    transition: "all 120ms",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Status */}
          {error && (
            <div
              style={{
                background: "var(--ft-error-bg)",
                color: "var(--ft-error-fg)",
                padding: "10px 14px",
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {items == null && !error && (
            <div style={{ color: "var(--ft-text-muted)", fontSize: 13 }}>
              Loading intakes…
            </div>
          )}

          {visibleItems && visibleItems.length === 0 && !error && (
            <div
              style={{
                background: "var(--ft-card)",
                border: "1px solid var(--ft-hair)",
                borderRadius: 12,
                padding: 40,
                textAlign: "center",
                color: "var(--ft-text-muted)",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontWeight: 600, color: "var(--ft-ink)" }}>
                No intakes match.
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Try a different state filter or clear the search.
              </div>
            </div>
          )}

          {/* Specforge intake #1026: count header above the stack. */}
          {visibleItems && visibleItems.length > 0 && (
            <QueueCountHeader shown={visibleItems.length} total={total} />
          )}

          {/* Card stack */}
          {visibleItems && visibleItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {visibleItems.map((item) => (
                <BacklogCard
                  key={item.id}
                  item={item}
                  onTriage={onTriage}
                  reasoningEditingId={reasoningEditingId}
                  summaryDraft={summaryDraft}
                  reasoningDraft={reasoningDraft}
                  onStartReasoning={() => onStartReasoning(item)}
                  onChangeSummary={setSummaryDraft}
                  onChangeReasoning={setReasoningDraft}
                  onSaveReasoning={onSaveReasoning}
                  onCancelReasoning={onCancelReasoning}
                  bodyEditingId={bodyEditingId}
                  titleDraft={titleDraft}
                  descriptionDraft={descriptionDraft}
                  onStartBody={() => onStartBody(item)}
                  onChangeTitle={setTitleDraft}
                  onChangeDescription={setDescriptionDraft}
                  onSaveBody={onSaveBody}
                  onCancelBody={onCancelBody}
                  onAddComment={onAddComment}
                  blocks={[]}
                  reorderEnabled={false}
                  isDragging={false}
                  isDragOver={false}
                  onDragStart={() => {}}
                  onDragOver={() => {}}
                  onDrop={() => {}}
                  onDragEnd={() => {}}
                  renderSignupAcceptBtn={undefined}
                  renderSignupProvisionPanel={undefined}
                />
              ))}
            </div>
          )}

          {/* Specforge intake #1026: cap notice — only renders when the
              endpoint capped the result set. */}
          {visibleItems && total > visibleItems.length && (
            <QueueCapNotice shown={visibleItems.length} total={total} />
          )}
        </div>
      </div>
    </BacklogUIProvider>
  );
}
