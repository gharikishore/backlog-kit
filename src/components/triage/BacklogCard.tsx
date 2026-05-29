"use client";
import { useEffect, useRef, useState } from "react";
import { Ban, Check, Copy as CopyIcon, GripVertical, PackageCheck, Pause, PauseCircle, Pencil, ShipWheel, X } from "lucide-react";
import { useBacklogUI } from "./kit-adapter";
import ReviewCard from "./ReviewCard";
import type { HistoryEntry, Item } from "../../types/backlog";
import { normalizeBlockStatus } from "../../types/backlog";
import { INTAKE_CATEGORIES, STATE_TONE } from "./constants";
import { iconForKind } from "./constants";
import { ActionBtn } from "./ActionBtn";
import { StateLozenge } from "./StateLozenge";
import { NoteEditor } from "./NoteEditor";
import { NoteDisplay } from "./NoteDisplay";
import { BlockStrip } from "./BlockStrip";
import { LogicalNextStrip } from "./LogicalNextStrip";
import { RelatedStrip } from "./RelatedStrip";
import { AttachmentsStrip } from "./AttachmentsStrip";
import { CommentsThread } from "./CommentsThread";
import { HistoryTimeline } from "./HistoryTimeline";
import { LinkifiedSeqText } from "./LinkifiedSeqText";

// SignupAcceptBtn + SignupProvisionPanel are specforge-specific (they
// know about role provisioning). Other consumers without signup flows
// pass undefined for the two `renderSignup*` props below — the card
// then renders nothing in those slots when kind=*_signup.

// One backlog card. Left column (aside) has the priority input + state
// buttons + decline/duplicate composers + parked/blocked indicator.
// Right column (article) has the kind pill, state lozenge, ship-approval
// pill, title + description (with body-edit inline form), metadata,
// screenshot toggle, signup-provisioning panel, decision-option radios,
// triage note (NoteEditor or NoteDisplay), history pane, comments
// thread, and the BlockStrip footer.
//
// Extracted from src/app/admin/backlog/page.tsx (intake #166).
export function BacklogCard({
  item,
  onTriage,
  reasoningEditingId,
  summaryDraft,
  reasoningDraft,
  onStartReasoning,
  onChangeSummary,
  onChangeReasoning,
  onSaveReasoning,
  onCancelReasoning,
  bodyEditingId,
  titleDraft,
  descriptionDraft,
  onStartBody,
  onChangeTitle,
  onChangeDescription,
  onSaveBody,
  onCancelBody,
  onAddComment,
  blocks,
  reorderEnabled,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  renderSignupAcceptBtn,
  renderSignupProvisionPanel,
  assigneeOptions = [],
  watcherOptions = [],
  onAddWatcher,
  onRemoveWatcher,
}: {
  item: Item;
  onTriage: (
    id: string,
    patch: Partial<{
      state: Item["state"];
      summary: string | null;
      triageReasoning: string | null;
      priority: number | null;
      decisionChoice: string | null;
      shipApproved: boolean;
      duplicateOfSeq: number | null;
      // Intake #133: block-status fields. Both can be sent independently
      // or together — see /api/admin/backlog/[id]/route.ts.
      blockStatus: "parked" | "blocked" | null;
      blockedBySeq: number | null;
      // Intake #132: admin edits to title + description.
      title: string | null;
      description: string;
      // Intake #218: category tag. null clears.
      category: string | null;
      // #1077: assignee. null clears.
      assigneeUserId: string | null;
    }>
  ) => Promise<void>;
  reasoningEditingId: string | null;
  summaryDraft: string;
  reasoningDraft: string;
  // Opens the note editor seeded with the card's current summary + reasoning.
  onStartReasoning: (id: string, currentSummary: string | null, currentReasoning: string | null) => void;
  onChangeSummary: (s: string) => void;
  onChangeReasoning: (s: string) => void;
  onSaveReasoning: () => void;
  onCancelReasoning: () => void;
  // Intake #132: title + description inline edit. Only one card can be
  // in body-edit mode at a time (same pattern as reasoningEditingId).
  bodyEditingId: string | null;
  titleDraft: string;
  descriptionDraft: string;
  onStartBody: (id: string, currentTitle: string | null, currentDescription: string) => void;
  onChangeTitle: (s: string) => void;
  onChangeDescription: (s: string) => void;
  onSaveBody: () => void;
  onCancelBody: () => void;
  // Intake #132: append a new comment to the ticket's discussion thread.
  // Returns a result so the card composer can clear/show errors locally.
  onAddComment: (ticketId: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  // Intake #541: inverse of blocked_by — the list of OTHER intake_items
  // whose blocked_by_intake_item_id points at THIS item, restricted to
  // pending/accepted/ready_to_ship (excludes shipped/declined/duplicate so
  // resolved chains don't pollute the count). Computed once on the page
  // side from the items array; passed in so the card stays presentation-
  // only. Empty array when nothing is downstream.
  blocks: Array<{ id: string; seq: number; title: string | null; state: Item["state"] }>;
  // Drag-to-reorder priority (intake #7). Disabled when sortMode would
  // make drag confusing (e.g. newest-first); in that case the grip still
  // shows but is non-interactive with a tooltip explaining the gate.
  reorderEnabled: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  /**
   * Render slot for the per-kind signup Accept button. Specforge
   * passes `(item) => <SignupAcceptBtn item={item} onProvisioned={...} />`.
   * Consumers without signup flows pass undefined.
   */
  renderSignupAcceptBtn?: (item: Item) => React.ReactNode;
  /**
   * Render slot for the signup provision panel (form for capturing
   * role assignment details). Same pattern as renderSignupAcceptBtn.
   */
  renderSignupProvisionPanel?: (item: Item) => React.ReactNode;
  /**
   * #1077 — admin-eligible users for the assignee picker. Consumer fetches
   * once (e.g. from /api/admin/users?systemRole=admin) and passes the
   * shortlist down. Empty array hides the picker — useful for read-only
   * embeds. Label is what the option shows; id is the uuid we patch.
   */
  assigneeOptions?: Array<{ id: string; label: string }>;
  /**
   * #1082 — watcher picker source. Same shape as assigneeOptions —
   * consumer fetches admin-eligible users once and passes the shortlist
   * down. Empty array hides the "+ watch" picker (useful for read-only
   * embeds). Existing watchers always render as chips regardless.
   */
  watcherOptions?: Array<{ id: string; label: string }>;
  /** #1082 — POST a watcher add. Called when the user picks from the
   *  "+ watch" dropdown. Wraps fetch + refresh in the consumer. */
  onAddWatcher?: (intakeId: string, watcherUserId: string) => Promise<void>;
  /** #1082 — DELETE a watcher. Called when the × on a chip is clicked. */
  onRemoveWatcher?: (intakeId: string, watcherUserId: string) => Promise<void>;
}) {
  const { Button, Lozenge } = useBacklogUI();
  // Fallback to Lightbulb for any kind not in the map (e.g. 'feature', future kinds)
  const KindIcon = iconForKind(item.kind);
  const tone = STATE_TONE[item.state];
  // Per-card toggle for inline screenshot rendering. Default off — the
  // user gets a compact link instead of a heavy thumbnail in the triage
  // scan. Flip on per-row when investigating a bug.
  const [screenshotInline, setScreenshotInline] = useState(false);

  // Local priority draft so typing doesn't fire a PATCH on every
  // keystroke. Commits on blur or Enter, only when the value actually
  // changed (intake #49 — restored after #7 mistakenly removed it).
  const [pri, setPri] = useState<string>(item.priority != null ? String(item.priority) : "");
  useEffect(() => {
    setPri(item.priority != null ? String(item.priority) : "");
  }, [item.priority]);

  function commitPriority() {
    const trimmed = pri.trim();
    const newVal = trimmed === "" ? null : parseInt(trimmed, 10);
    if (newVal !== null && !Number.isFinite(newVal)) {
      setPri(item.priority != null ? String(item.priority) : "");
      return;
    }
    if (newVal === item.priority) return;
    onTriage(item.id, { priority: newVal });
  }

  // History fetched on demand. null = not loaded; [] = loaded empty.
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const r = await fetch(`/api/admin/backlog/${item.id}/history`, { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setHistory(d.entries ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    setHistoryOpen((open) => {
      const next = !open;
      if (next && history === null && !historyLoading) loadHistory();
      return next;
    });
  }

  const editingReasoning = reasoningEditingId === item.id;
  const shipApproved = !!item.shipApprovedAt;

  // Intake #69: cards default to compact (just kind+state pills + title).
  // Click the title — or the chevron — to expand and reveal description,
  // metadata, screenshot, note, and history. The right article then
  // stretches to roughly match the left aside's natural height.
  //
  // Force-expand when there's something the admin can't ignore: an
  // un-answered decision prompt, or the note editor is open. METAs
  // also default-expand because the most valuable thing on a META card
  // is the children list embedded in its description — keeping that
  // hidden behind a chevron click defeated the point of the section.
  const awaitingDecision = !!(item.decisionOptions && item.decisionOptions.length > 0 && !item.decisionChoice);
  const isMeta = !!item.title?.toLowerCase().startsWith("meta:") || !!item.pageUrl?.startsWith("meta:");
  const [expanded, setExpanded] = useState(isMeta);
  const showDetails = expanded || awaitingDecision || editingReasoning;

  // Intake #75 v2: clip the article at the aside's actual height and only
  // surface the expand chevron when content genuinely overflows. The
  // aside's height isn't fixed (it grows when inline Decline/Duplicate
  // editors open), so we observe it instead of hardcoding 466px.
  const asideRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [asideHeight, setAsideHeight] = useState<number | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setAsideHeight(entries[0].contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-measure overflow whenever the cap or the content can change.
  //
  // Intake #149 follow-up: after the description / NoteDisplay /
  // CommentsThread-list were each wrapped in their own `flex-1
  // min-h-0 overflow-hidden` region, the ARTICLE's outer scrollHeight
  // equals its clientHeight even when content is clipped inside the
  // wrappers. The old article-level scrollHeight > clientHeight check
  // therefore reports `false` and the chevron / title-click affordance
  // disappears.
  //
  // The real "there's hidden content" signal is: ANY of the shrinkable
  // regions has its own scrollHeight > clientHeight. We tagged each of
  // those wrappers with the `flex-1` Tailwind class, so we find them
  // by querying direct children that match. If at least one is clipped
  // — or the article itself is — we surface the chevron.
  useEffect(() => {
    if (showDetails || !articleRef.current || asideHeight == null) {
      setIsOverflowing(false);
      return;
    }
    const a = articleRef.current;
    const articleClipped = a.scrollHeight > a.clientHeight + 1;
    // Any direct child with flex-1 + overflow-hidden is a shrinkable
    // region; check each for inner overflow.
    const shrinkable = Array.from(a.querySelectorAll<HTMLElement>(":scope > .flex-1"));
    const anyShrinkableClipped = shrinkable.some((el) => el.scrollHeight > el.clientHeight + 1);
    setIsOverflowing(articleClipped || anyShrinkableClipped);
  }, [showDetails, asideHeight, item.description, item.summary, item.triageReasoning, item.title]);

  // State-button factory: visually active when the row is in that state.
  function StateBtn({ s, icon: Icon, label, activeBg }: { s: Item["state"]; icon: typeof Check; label: string; activeBg: string }) {
    return (
      <ActionBtn
        active={item.state === s}
        activeColor={activeBg}
        onClick={() => onTriage(item.id, { state: s })}
        title={`Mark ${label}`}
      >
        <Icon size={12} /> {label}
      </ActionBtn>
    );
  }

  // Ship button — different shape from StateBtn because it doesn't flip
  // state. It stamps ship_approved_at (or clears it if already set).
  // Greyed out if state isn't ready_to_ship (you can't approve shipping
  // something that isn't ready yet) or if state is already 'shipped'
  // (already done). Active style when approval is currently set.
  // Decline composer — Decline is terminal so we capture WHY in the same
  // PATCH that flips state. Clicking the button opens an inline textarea
  // (same pattern as the duplicate picker). Save submits
  // { state: 'declined', triageReasoning } atomically. If already declined,
  // clicking the button re-opens the composer with the current reason
  // pre-filled so admin can edit. Withdraw button flips back to pending
  // and clears the decline reasoning (intake #40).
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineDraft, setDeclineDraft] = useState<string>(
    item.state === "declined" && item.triageReasoning ? item.triageReasoning : ""
  );
  useEffect(() => {
    setDeclineDraft(item.state === "declined" && item.triageReasoning ? item.triageReasoning : "");
  }, [item.state, item.triageReasoning]);

  async function submitDecline() {
    const reason = declineDraft.trim();
    if (!reason) {
      if (!window.confirm("Decline without a reason? (You can add one later via the note field.)")) return;
    }
    await onTriage(item.id, { state: "declined", triageReasoning: reason || null });
    setDeclineOpen(false);
  }

  function DeclineBtn() {
    const active = item.state === "declined";
    return (
      <ActionBtn
        active={active}
        activeColor="#7a1f1f"
        onClick={() => setDeclineOpen((o) => !o)}
        title={active ? "Edit decline reason" : "Decline — captures why in the same step"}
      >
        <X size={12} /> Decline
      </ActionBtn>
    );
  }

  // Block button — clicking opens an inline composer with a status
  // dropdown (Parked / Blocked until / — clear —) + optional seq#
  // input. Submitting PATCHes `{ blockStatus, blockedBySeq }` in one
  // shot. The composer doesn't terminal-state the row — the item stays
  // in 'accepted' or wherever it is, but sorts to the bottom of its
  // state bucket so the agent's "pick top" skips it (intake #133).
  const [blockOpen, setBlockOpen] = useState(false);
  // Intake #140 (final): tracks whether a comment is being composed
  // (any non-empty draft in the CommentsThread textarea). When true,
  // the article lifts its compact-mode max-height clip so the user
  // can see what they're typing — same expand-on-interaction pattern
  // as `blockOpen` and `editingReasoning`.
  const [composingComment, setComposingComment] = useState(false);
  // Consumer #927: the DB column is plain TEXT; we've seen legacy 'open' rows
  // slip past the TS contract. normalizeBlockStatus coerces any unknown value
  // to null, which the draft maps to "" so the select shows "— clear —"
  // instead of an unselected option that the user can't recover from.
  const [blockStatusDraft, setBlockStatusDraft] = useState<"" | "parked" | "blocked">(
    normalizeBlockStatus(item.blockStatus) ?? ""
  );
  const [blockSeqDraft, setBlockSeqDraft] = useState<string>(
    item.blockedBySeq != null ? String(item.blockedBySeq) : ""
  );
  useEffect(() => {
    setBlockStatusDraft(normalizeBlockStatus(item.blockStatus) ?? "");
    setBlockSeqDraft(item.blockedBySeq != null ? String(item.blockedBySeq) : "");
  }, [item.blockStatus, item.blockedBySeq]);

  async function submitBlock() {
    const status = blockStatusDraft === "" ? null : blockStatusDraft;
    let seq: number | null = null;
    const trimmed = blockSeqDraft.trim();
    if (trimmed !== "") {
      const n = parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n <= 0) {
        alert("Ticket number must be a positive integer (or empty).");
        return;
      }
      if (n === item.seq) {
        alert("An item can't be blocked by itself.");
        return;
      }
      seq = n;
    }
    // When clearing the status entirely, also clear the seq pointer
    // (the API does the same — but explicit is better than implicit).
    await onTriage(item.id, {
      blockStatus: status,
      blockedBySeq: status === null ? null : seq,
    });
    setBlockOpen(false);
  }

  // Intake #140: the standalone BlockBtn was removed when block UI
  // consolidated into the BlockStrip (article footer) + the aside pill.
  // If a future flow needs a button-style trigger, reach for the
  // BlockStrip composer rather than reintroducing this.

  // Duplicate button — clicking opens an inline seq# input. Submitting
  // PATCHes `{ state: 'duplicate', duplicateOfSeq: N }` in one shot.
  // If already in duplicate state, clicking the button instead clears the
  // pointer + flips back to pending (acts as a withdrawal). Also handles
  // re-pointing the duplicate to a different parent when already marked.
  const [dupOpen, setDupOpen] = useState(false);
  const [dupDraft, setDupDraft] = useState<string>(item.duplicateOfSeq != null ? String(item.duplicateOfSeq) : "");
  useEffect(() => {
    setDupDraft(item.duplicateOfSeq != null ? String(item.duplicateOfSeq) : "");
  }, [item.duplicateOfSeq]);

  async function submitDup() {
    const trimmed = dupDraft.trim();
    if (trimmed === "") return;
    const parentSeq = parseInt(trimmed, 10);
    if (!Number.isFinite(parentSeq) || parentSeq <= 0) {
      alert("Enter a positive item number.");
      return;
    }
    if (parentSeq === item.seq) {
      alert("An item can't be a duplicate of itself.");
      return;
    }
    await onTriage(item.id, { state: "duplicate", duplicateOfSeq: parentSeq });
    setDupOpen(false);
  }

  function DupBtn() {
    const active = item.state === "duplicate";
    return (
      <ActionBtn
        active={active}
        activeColor="#7a766f"
        onClick={() => setDupOpen((o) => !o)}
        title={active ? "Re-point to a different parent" : "Mark as duplicate — requires a reference seq#"}
      >
        <CopyIcon size={12} /> Duplicate
      </ActionBtn>
    );
  }

  function ShipBtn() {
    const enabled = item.state === "ready_to_ship";
    const active = shipApproved;
    return (
      <ActionBtn
        active={active}
        activeColor="#1a3a78"
        onClick={() => onTriage(item.id, { shipApproved: !shipApproved })}
        disabled={!enabled}
        title={
          !enabled
            ? "Only ready_to_ship items can be approved for shipping"
            : active
              ? "Withdraw approval"
              : "Approve for shipping (agent commits on your separate instruction)"
        }
      >
        <ShipWheel size={12} /> {active ? "Approved" : "Ship"}
      </ActionBtn>
    );
  }

  // Intake #117: the outer flex chrome (aside box + article box) is
  // now provided by <ReviewCard>. The aside content (priority,
  // state buttons, decline/duplicate composers, the parked/blocked
  // pill) is assembled here and passed in via the `aside` prop;
  // everything else (kind pill, title, metadata, reasoning,
  // discussion thread, BlockStrip) renders as ReviewCard children.
  const asideContent = (
    <>
        <div className="flex items-start justify-between mb-1">
          <div className="font-display text-3xl font-medium leading-none">
            <span className="opacity-50 text-xl">#</span>{item.seq}
          </div>
          <GripVertical size={18} className={reorderEnabled ? "opacity-50" : "opacity-[0.18]"} />
        </div>
        <div className="text-[11px] uppercase tracking-kicker text-ink/55 mb-0.5 font-sans">Priority</div>
        {/* Numeric input AND drag handle both work (intake #49 fixes
            the regression #7 introduced). Type a number to set/edit
            directly; drag the grip icon to reorder relative to other
            visible cards. draggable={false} on the input prevents
            the input itself from initiating a drag. */}
        <input
          type="number"
          value={pri}
          draggable={false}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setPri(e.target.value)}
          onBlur={commitPriority}
          onKeyDown={(e) => {
            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setPri(item.priority != null ? String(item.priority) : ""); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder="—"
          className="bg-card border border-hair-strong rounded-kit px-2.5 py-2 text-base w-full font-sans text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
          title="Type a priority number (lower = higher in queue). Or drag the grip handle above to reorder relative to other cards."
        />
        {/* Intake #140 (revised): parked / blocked-until indicator in
            the aside. When set, it reads at a glance from the status
            column without having to scan to the article footer where
            the BlockStrip lives. Clicking the pill scrolls into and
            opens the BlockStrip composer so edits happen in one place
            (the article-bottom strip remains the source of truth).
            Hidden for terminal-state tickets (shipped / declined /
            duplicate / provisioned) — same logic as the BlockStrip
            itself: block tracking is irrelevant after the ticket has
            left the active queue. */}
        {(() => {
          // Consumer #927: normalize before render so an invalid runtime
          // value (e.g. legacy 'open') doesn't fall through to "Parked".
          const safeBlock = normalizeBlockStatus(item.blockStatus);
          if (!safeBlock) return null;
          if (item.state === "shipped" || item.state === "declined" || item.state === "duplicate" || item.state === "provisioned") return null;
          return (
            <button
              type="button"
              onClick={() => {
                if (!blockOpen) setBlockOpen(true);
                // Defer to next frame so the composer is mounted, then
                // scroll the article-bottom strip into view.
                setTimeout(() => {
                  const el = asideRef.current?.parentElement?.querySelector('[data-block-strip]') as HTMLElement | null;
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
              }}
              className={[
                "flex items-center gap-1.5 px-2.5 py-1.5 mt-2 text-[12px] uppercase tracking-kicker border-l-2 w-full font-sans transition-colors",
                safeBlock === "blocked"
                  ? "text-warning-fg bg-gold/15 border-gold"
                  : "text-navy bg-navy/10 border-navy",
              ].join(" ")}
              title={`${safeBlock === "blocked" ? "Blocked" : "Parked"}${item.blockedBySeq ? ` (#${item.blockedBySeq})` : ""}. Click to edit.`}
            >
              {safeBlock === "blocked" ? <Ban size={12} /> : <PauseCircle size={12} />}
              <span className="truncate">
                {safeBlock === "blocked" ? "Blocked" : "Parked"}
                {item.blockedBySeq ? ` · #${item.blockedBySeq}` : ""}
              </span>
            </button>
          );
        })()}
        <div className="text-[11px] uppercase tracking-kicker text-ink/55 mt-2 mb-0.5 font-sans">Action</div>
        {/* Terminal-state confirmation pill. The Ship button stamps approval,
            not state, so when state=shipped there's no Ship "active" highlight
            in the action buttons below — that left the left box looking
            blank/greyed-out for shipped/declined/duplicate rows (intake #38).
            This pill restores a clear visual at the top of the action group. */}
        {(item.state === "shipped" || item.state === "provisioned" || item.state === "declined" || item.state === "duplicate") && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 mb-1 text-[12px] uppercase tracking-kicker border-l-2 font-sans rounded-kit"
            style={{ color: tone.fg, backgroundColor: tone.bg, borderColor: tone.fg }}
            title={`Current state: ${tone.label}`}
          >
            <Check size={12} /> {tone.label}
          </div>
        )}
        {/* "Back to triage" button — visible whenever state isn't already
            at the start state so admin can change their mind on any
            prior triage decision (intake #50). Sits at the top so it
            reads as 'back to start.' For signup kinds the start state
            is 'requested'; for everything else it's 'pending'. */}
        {item.kind === "contributor_signup" || item.kind === "customer_signup" ? (
          <>
            <StateBtn s="requested" icon={Pause} label="Requested" activeBg="#7a4f1f" />
            {/* Intake #122/#121: for signup kinds, Accept must go through
                the real provisioning flow — auth user + users row +
                role_seeds + outbox + state flip atomically — not a raw
                state PATCH. Ready + Ship hidden for signups (no
                code-shipping concept; provisioning IS the work). */}
            {renderSignupAcceptBtn ? renderSignupAcceptBtn(item) : null}
          </>
        ) : (
          <>
            <StateBtn s="pending" icon={Pause} label="Pending" activeBg="#7a4f1f" />
            <StateBtn s="accepted" icon={Check} label="Accept" activeBg="#226633" />
            <StateBtn s="ready_to_ship" icon={PackageCheck} label="Ready" activeBg="#C5421B" />
            {/* Ship is the only state button that does NOT flip state directly.
                It stamps ship_approved_at, signaling "agent, commit this." The
                agent flips state to 'shipped' atomically when it actually
                commits the code. */}
            <ShipBtn />
          </>
        )}
        <DeclineBtn />
        {declineOpen && (
          <div className="border border-hair-strong rounded-kit bg-card px-2 py-2 flex flex-col gap-1.5 font-sans">
            <label className="text-[9px] uppercase tracking-kicker text-ink/55">Decline reason</label>
            <textarea
              value={declineDraft}
              onChange={(e) => setDeclineDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitDecline(); }
                if (e.key === "Escape") { setDeclineOpen(false); }
              }}
              placeholder="Why? (recommended)"
              rows={3}
              className="border border-hair-strong rounded-kit px-2 py-1 text-sm resize-y bg-card text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
            />
            <div className="flex items-center gap-2 justify-end">
              {item.state === "declined" && (() => {
                const isSignup = item.kind === "contributor_signup" || item.kind === "customer_signup";
                const backState = isSignup ? "requested" : "pending";
                return (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Reset to ${backState} and clear the decline reason?`)) return;
                      await onTriage(item.id, { state: backState, summary: null, triageReasoning: null });
                      setDeclineDraft("");
                      setDeclineOpen(false);
                    }}
                    className="text-[9px] uppercase tracking-kicker text-ink/55 hover:text-ink transition-colors"
                    title="Withdraw decline"
                  >
                    Withdraw
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => setDeclineOpen(false)}
                className="text-[9px] uppercase tracking-kicker text-ink/55 hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <Button kind="danger" onClick={submitDecline} className="!px-2 !py-1 text-[9px] uppercase tracking-kicker">
                Decline
              </Button>
            </div>
          </div>
        )}
        <DupBtn />
        {dupOpen && (
          <div className="border border-hair-strong rounded-kit bg-card px-2 py-2 flex flex-col gap-1.5 font-sans">
            <label className="text-[9px] uppercase tracking-kicker text-ink/55">Duplicate of #</label>
            <input
              type="number"
              value={dupDraft}
              onChange={(e) => setDupDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitDup(); }
                if (e.key === "Escape") { setDupOpen(false); }
              }}
              placeholder="seq#"
              className="border border-hair-strong rounded-kit px-2 py-1 text-sm font-sans bg-card text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
            />
            <div className="flex items-center gap-2 justify-end">
              {item.state === "duplicate" && (() => {
                const isSignup = item.kind === "contributor_signup" || item.kind === "customer_signup";
                const backState = isSignup ? "requested" : "pending";
                return (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Clear the duplicate-of pointer and re-open the item as ${backState}?`)) return;
                      await onTriage(item.id, { state: backState, duplicateOfSeq: null });
                      setDupOpen(false);
                    }}
                    className="text-[9px] uppercase tracking-kicker text-ink/55 hover:text-ink transition-colors"
                    title="Withdraw duplicate marking"
                  >
                    Withdraw
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => setDupOpen(false)}
                className="text-[9px] uppercase tracking-kicker text-ink/55 hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <Button kind="primary" onClick={submitDup} className="!px-2 !py-1 text-[9px] uppercase tracking-kicker">
                Save
              </Button>
            </div>
          </div>
        )}
        {/* Intake #140: Block button + composer moved out of the
            aside into a horizontal strip in the article body (see
            BlockStrip render below the metadata row). The aside now
            only carries state-flip actions; status indicators +
            block control live in the article. */}
    </>
  );

  return (
    <ReviewCard
      asideRef={asideRef}
      articleRef={articleRef}
      asideHeight={asideHeight}
      // Compact-mode clip is lifted by ANY interaction that needs
      // vertical room: full-details expand, block composer open,
      // reasoning editor open, or active comment composition.
      expanded={showDetails || blockOpen || editingReasoning || composingComment}
      drag={{
        enabled: reorderEnabled,
        isDragging,
        isDragOver,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDrop,
      }}
      asideTitle={reorderEnabled ? "Drag to reorder priority" : "Switch sort to Default or Priority to enable drag-reorder"}
      aside={asideContent}
    >

      {/* Intake #117: the article chrome — border, padding, max-height
          compact-mode clip, overflow control, flex column behavior,
          and the `[&>*]:flex-shrink-0` shrink-control pattern — all
          live in <ReviewCard> now. Article children below stay
          authored as before; the only one that gets the squeeze
          (CommentsThread's list region) opts in via
          `flex-1 min-h-0 overflow-hidden`. */}
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-kicker mb-2 flex-wrap font-sans text-ink/85">
          <KindIcon size={13} />
          <span className="text-orange">{item.kind === "contributor_signup" ? "contrib. signup" : item.kind === "customer_signup" ? "validator signup" : item.kind}</span>
          <span className="text-ink/40">·</span>
          <StateLozenge state={item.state} />
          {shipApproved && item.state === "ready_to_ship" && (
            // Intake #191: only meaningful while the card is waiting to be
            // committed. `ship_approved_at` is not nulled when the commit
            // lands, so on shipped cards the timestamp stays but the pill
            // becomes stale — gate it on the state instead of just the
            // stamp so it disappears as soon as state moves past
            // ready_to_ship.
            <Lozenge tone="success">✓ Approved · commit pending</Lozenge>
          )}
          {item.duplicateOfSeq != null && (
            <span className="px-2 py-0.5 normal-case rounded-full bg-ink/[0.08] text-ink/65">
              ⇒ Duplicate of #{item.duplicateOfSeq}
              {item.duplicateOfTitle && <span className="text-ink/55"> — {item.duplicateOfTitle}</span>}
            </span>
          )}
          {/* Intake #239: cross-surface session attribution. Renders
              when an agent filed the intake via the session-tracking
              API and posted a kind='intake_created' activity. Clicking
              jumps to the session detail page. Older intakes (or
              direct-DB inserts that bypass the agent path) silently
              render nothing. */}
          {item.createdInSessionId && (
            <a
              href={`/admin/sessions/${item.createdInSessionId}`}
              className="px-2 py-0.5 normal-case rounded-full text-navy bg-navy/10 hover:bg-navy/15 transition-colors"
              title="Open the session that filed this intake"
            >
              via {item.createdInSessionDisplayName ?? "session"}
            </a>
          )}
          {/* Intake #218: category pill + inline picker. Native
              <select> for keyboard accessibility; styled to read as
              a pill. Set value = "" maps to null on the wire (clears
              the column). */}
          <label className="inline-flex items-center" title="Set the ticket's category">
            <span className="sr-only">Category</span>
            <select
              value={item.category ?? ""}
              onChange={(e) => onTriage(item.id, { category: e.target.value === "" ? null : e.target.value })}
              className={[
                "text-[11px] uppercase tracking-kicker px-2 py-0.5 rounded-full border cursor-pointer font-sans transition-colors",
                item.category
                  ? "text-navy bg-navy/10 border-navy/35"
                  : "text-ink/55 bg-transparent border-hair-strong",
              ].join(" ")}
            >
              <option value="">+ category</option>
              {INTAKE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          {/* #1077 — assignee pill + inline picker. Mirrors the category
              pattern: native <select> styled as a pill, value="" clears.
              Renders nothing when the consumer didn't pass assigneeOptions
              (read-only embeds). The selected label prefers the option's
              label string over the server-supplied assigneeLabel — the
              former is freshest while a PATCH is in flight, before the
              optimistic-or-refetched item.assigneeLabel catches up. */}
          {assigneeOptions.length > 0 && (
            <label className="inline-flex items-center" title="Assign this ticket to a user">
              <span className="sr-only">Assignee</span>
              <select
                value={item.assigneeUserId ?? ""}
                onChange={(e) => onTriage(item.id, { assigneeUserId: e.target.value === "" ? null : e.target.value })}
                className={[
                  "text-[11px] uppercase tracking-kicker px-2 py-0.5 rounded-full border cursor-pointer font-sans transition-colors",
                  item.assigneeUserId
                    ? "text-success bg-success/10 border-success/35"
                    : "text-ink/55 bg-transparent border-hair-strong",
                ].join(" ")}
              >
                <option value="">+ assignee</option>
                {assigneeOptions.map((u) => (
                  <option key={u.id} value={u.id}>@{u.label}</option>
                ))}
              </select>
            </label>
          )}
          {/* #1082 — watchers chiplist + "+ watch" picker. Each watcher
              renders as a navy-tinted chip with an × button to remove.
              Existing watcher chips ALWAYS render (read-only when
              onRemoveWatcher isn't supplied). The "+ watch" dropdown only
              renders when watcherOptions is non-empty + onAddWatcher is
              wired — same gate as the assignee picker.
              The picker filters out users who are ALREADY watching so
              they don't show as duplicates. */}
          {(item.watchers ?? []).map((w) => (
            <span
              key={w.userId}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-kicker px-2 py-0.5 rounded-full border text-navy bg-navy/10 border-navy/35"
              title={`Watching · added ${new Date(w.addedAt).toLocaleDateString()}`}
            >
              <span>@{w.label}</span>
              {onRemoveWatcher && (
                <button
                  type="button"
                  className="opacity-65 hover:opacity-100 leading-none"
                  onClick={() => onRemoveWatcher(item.id, w.userId)}
                  title={`Stop ${w.label} watching this intake`}
                  aria-label={`Remove watcher ${w.label}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {watcherOptions.length > 0 && onAddWatcher && (() => {
            const watchedIds = new Set((item.watchers ?? []).map((w) => w.userId));
            const available = watcherOptions.filter((u) => !watchedIds.has(u.id));
            if (available.length === 0) return null;
            return (
              <label className="inline-flex items-center" title="Add a watcher to this intake">
                <span className="sr-only">Add watcher</span>
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    void onAddWatcher(item.id, v);
                    // Reset select so picking the same user twice (after
                    // remove) still fires.
                    e.currentTarget.value = "";
                  }}
                  className="text-[11px] uppercase tracking-kicker px-2 py-0.5 rounded-full border cursor-pointer font-sans transition-colors text-ink/55 bg-transparent border-hair-strong"
                >
                  <option value="">+ watch</option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>@{u.label}</option>
                  ))}
                </select>
              </label>
            );
          })()}
          {/* Intake #140: parked/blocked pills removed from the article
              header. Block status now renders as a dedicated horizontal
              strip below the metadata row — both the status display +
              the composer trigger live there, replacing the BlockBtn
              that used to sit in the aside. */}
        </div>
        {/* Intake #132: inline edit for title + description. When in
            edit mode the static h3 + paragraph are replaced with
            input + textarea, Save/Cancel underneath. Otherwise: the
            existing collapsible title + description rendering. */}
        {bodyEditingId === item.id ? (
          <div className="mb-3 flex flex-col gap-2 border-l-2 border-ink pl-3 font-sans">
            <div className="text-[9px] uppercase tracking-kicker text-ink/55">Title (optional)</div>
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => onChangeTitle(e.target.value)}
              maxLength={280}
              autoFocus
              placeholder="(no title — first 80 chars of description show as headline)"
              className="text-lg font-medium border border-hair-strong rounded-kit px-2 py-1.5 bg-card text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
              onKeyDown={(e) => { if (e.key === "Escape") onCancelBody(); }}
            />
            <div className="text-[9px] uppercase tracking-kicker text-ink/55 mt-1">Description</div>
            <textarea
              value={descriptionDraft}
              onChange={(e) => onChangeDescription(e.target.value)}
              rows={Math.max(4, Math.min(12, descriptionDraft.split("\n").length + 1))}
              className="text-sm border border-hair-strong rounded-kit px-2 py-1.5 resize-y bg-card text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelBody();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSaveBody(); }
              }}
            />
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[9px] text-ink/50">{descriptionDraft.length} chars</span>
              <button type="button" onClick={onCancelBody} className="text-[10px] uppercase tracking-kicker text-ink/55 hover:text-ink transition-colors">
                Cancel
              </button>
              <Button kind="primary" onClick={onSaveBody} className="!px-3 !py-1 text-[10px] uppercase tracking-kicker">
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Title row. Clicking toggles details ONLY when the card has
                content past the clip line (intake #75 v2). Non-overflowing
                cards drop the chevron + click affordance entirely — no
                phantom UI for an action that wouldn't change anything. */}
            {isOverflowing || showDetails ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full text-left flex items-start gap-2 mb-2 group"
                title={showDetails ? "Hide details" : "Show details"}
              >
                <h3 className="text-xl font-medium leading-snug flex-1 min-w-0">
                  {item.title ?? item.description.slice(0, 80) + (item.description.length > 80 ? "…" : "")}
                </h3>
                <span
                  className="text-[11px] uppercase tracking-kicker text-ink/45 group-hover:text-ink/85 mt-1 flex-shrink-0 transition-colors"
                  aria-hidden="true"
                >
                  {showDetails ? "▴" : "▾"}
                </span>
              </button>
            ) : (
              <h3 className="text-xl font-medium leading-snug mb-2">
                {item.title ?? item.description.slice(0, 80) + (item.description.length > 80 ? "…" : "")}
              </h3>
            )}
            {/* Intake #149: the description was previously a direct
                child of the article, so the article's
                [&>*]:flex-shrink-0 baseline kept it at full natural
                height — for a very long description (e.g. #142),
                that pushed the BlockStrip past the compact-mode
                clip line entirely. Wrapping in a flex-1 shrinkable
                region (only in compact mode) lets the description
                clip from the bottom while keeping BlockStrip + the
                comment form fully visible at the article footer.
                In expanded mode the constraint is dropped so the
                full description renders. */}
            {item.title && (
              <div className={!showDetails ? "flex-1 min-h-0 overflow-hidden mb-2" : "mb-2"}>
                <LinkifiedSeqText
                  text={item.description}
                  className="text-base text-ink/85 whitespace-pre-wrap leading-relaxed"
                />
              </div>
            )}
          </>
        )}
        <div className="text-[12px] uppercase tracking-kicker text-ink/55 flex items-center gap-2 flex-wrap font-sans">
          {/* Intake #66: name-agnostic label — handle or role, never
              name/email — sourced from the server's reporterLabel. */}
          <span>{item.reporterLabel}</span>
          <span className="text-ink/45">·</span>
          <span>{new Date(item.createdAt).toLocaleString()}</span>
          {item.pageUrl && <span className="ml-1 normal-case text-ink/55 truncate">{item.pageUrl}</span>}
          {/* Intake #132: edit affordance for title + description. Only
              shows when not already editing. */}
          {bodyEditingId !== item.id && (
            <button
              type="button"
              onClick={() => onStartBody(item.id, item.title, item.description)}
              className="ml-auto text-ink/55 hover:text-ink flex items-center gap-1 transition-colors"
              title="Edit ticket title + description"
            >
              <Pencil size={11} /> Edit
            </button>
          )}
        </div>

        {/* Screenshots attached to the intake row. Three shapes supported:
            (1) context.screenshotUrl — R2-served URL via /api/screenshots
            proxy (intake #845, current shape). (2) context.screenshotDataUrl
            — single data: URL (legacy bug-report widget, intake #38; kept
            for grace-period reads until backfill is verified). (3)
            context.screenshots — array of data: URLs (design-review
            tickets that need multiple visuals, intake #196).
            Union of all is rendered as a vertical gallery, each image
            gets its own view-full-size link, shares one show/hide toggle.
            Whole block hidden in compact mode (intake #69). */}
        {showDetails && (() => {
          const ctx = item.context as Record<string, unknown> | null;
          // Prefer the new R2-served URL (intake #845). Falls back to
          // the legacy base64 path for rows not yet backfilled.
          const primary = typeof ctx?.screenshotUrl === "string" && ctx.screenshotUrl.startsWith("/api/screenshots/")
            ? ctx.screenshotUrl
            : typeof ctx?.screenshotDataUrl === "string" && ctx.screenshotDataUrl.startsWith("data:image/")
            ? ctx.screenshotDataUrl
            : null;
          const extras = Array.isArray(ctx?.screenshots)
            ? (ctx.screenshots as unknown[]).filter((s): s is string => typeof s === "string" && s.startsWith("data:image/"))
            : [];
          const all = primary ? [primary, ...extras] : extras;
          if (all.length === 0) return null;
          const labelOf = (i: number) => all.length === 1 ? "View screenshot" : `View screenshot ${i + 1} of ${all.length}`;
          return (
            <div className="mt-3">
              <div className="flex items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-kicker text-ink/70 flex-wrap font-sans">
                {all.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-orange hover:opacity-90 transition-opacity"
                    title="Open full-size in a new tab"
                  >
                    📷 {labelOf(i)}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => setScreenshotInline((v) => !v)}
                  className="text-ink/55 hover:text-ink transition-colors"
                >
                  {screenshotInline ? "hide inline" : "show inline"}
                </button>
              </div>
              {screenshotInline && (
                <div className="mt-2 flex flex-col gap-3">
                  {all.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block border border-hair rounded-kit hover:opacity-80 transition-opacity max-w-[480px]"
                      title="Open full-size in a new tab"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Screenshot ${i + 1}`} className="block max-w-full h-auto rounded-kit" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Signup-kind provisioning panel (intake #107). Always rendered
            for signup kinds — intake #122 surfaced that gating it on
            showDetails meant short signup cards never exposed the form
            data or the provisioning button. Admin needs to see the
            submitted info to decide; the panel IS the card's purpose
            for these kinds. */}
        {(item.kind === "contributor_signup" || item.kind === "customer_signup") && renderSignupProvisionPanel
          ? renderSignupProvisionPanel(item)
          : null}

        {/* Decision options — when the agent files an item that needs the
            user's input, it includes a set of options. The user picks one
            via radio; the choice is recorded in audit_log for posterity. */}
        {item.decisionOptions && item.decisionOptions.length > 0 && (
          <div className="mt-4 border-l-2 border-ink pl-4 py-3 bg-ink/[0.04] rounded-kit font-sans">
            <div className="text-[12px] uppercase tracking-kicker mb-2 text-ink/75">Needs your decision</div>
            <div className="space-y-2">
              {item.decisionOptions.map((opt) => {
                const chosen = item.decisionChoice === opt.value;
                return (
                  <label key={opt.value} className="flex items-start gap-2.5 text-base cursor-pointer">
                    <input
                      type="radio"
                      name={`decision-${item.id}`}
                      value={opt.value}
                      checked={chosen}
                      onChange={() => onTriage(item.id, { decisionChoice: opt.value })}
                      className="mt-1.5"
                    />
                    <span className={chosen ? "font-medium" : ""}>
                      <span>{opt.label}</span>
                      {opt.detail && <span className="block text-sm text-ink/65 mt-0.5">{opt.detail}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {item.decisionChoice && item.decisionChosenAt && (
              <div className="mt-2 text-[11px] uppercase tracking-kicker text-ink/55">
                Decision recorded · {new Date(item.decisionChosenAt).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Note: summary headline + optional full reasoning. The editor
            covers both fields; the display collapses to summary by
            default with a "show full reasoning" expand (intake #56).
            In compact mode the note (admin's comments) now renders
            inline with the description so the box fills with all the
            text content — the article's overflow clip handles any
            spillover (intake #78 refinement: "comments or feedback"). */}
        {editingReasoning && (
          <NoteEditor
            summaryDraft={summaryDraft}
            reasoningDraft={reasoningDraft}
            onChangeSummary={onChangeSummary}
            onChangeReasoning={onChangeReasoning}
            onSave={onSaveReasoning}
            onCancel={onCancelReasoning}
          />
        )}
        {/* Intake #149: NoteDisplay (summary + reasoning preview)
            wrapped in a shrinkable flex region so a long summary
            doesn't push the BlockStrip past the article's compact-
            mode clip. Same pattern as the description wrapper above
            and the CommentsThread list region — all three flexible
            blocks split the available vertical space when the
            article is constrained; the chevron-expand lifts the
            clip and shows everything in full (className flips so the
            constraint doesn't carry over). */}
        {!editingReasoning && (item.summary || item.triageReasoning) && (
          <div className={!showDetails ? "flex-1 min-h-0 overflow-hidden" : ""}>
            <NoteDisplay
              summary={item.summary}
              reasoning={item.triageReasoning}
              toneFg={tone.fg}
              forceShowFull={showDetails}
              onEdit={() => onStartReasoning(item.id, item.summary, item.triageReasoning)}
            />
          </div>
        )}
        {showDetails && !editingReasoning && !item.summary && !item.triageReasoning && (
          <button
            type="button"
            onClick={() => onStartReasoning(item.id, null, null)}
            className="mt-3 text-[11px] uppercase tracking-kicker text-ink/50 hover:text-ink flex items-center gap-1 transition-colors font-sans"
          >
            <Pencil size={11} /> Add note
          </button>
        )}

        {/* Intake #132: CommentsThread rendered OUTSIDE the article
            (below the aside+article flex row) so the article's
            max-height clip (intake #75) doesn't hide it on
            non-expanded cards. See the bottom of this return for the
            actual render. */}

        {/* History toggle + pane. Hidden in compact mode (intake #69). */}
        {showDetails && (
          <div className="mt-4 pt-3 border-t border-hair font-sans">
            <button
              type="button"
              onClick={toggleHistory}
              className="text-[11px] uppercase tracking-kicker text-ink/55 hover:text-ink transition-colors"
            >
              {historyOpen ? "Hide history" : "Show history"}
            </button>
            {historyOpen && (
              <div className="mt-3">
                {historyLoading ? (
                  <div className="text-[11px] text-ink/55">Loading history…</div>
                ) : history === null || history.length === 0 ? (
                  <div className="text-[11px] text-ink/55">No history yet.</div>
                ) : (
                  <HistoryTimeline entries={history} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Intake #145 + #140 (final layout): CommentsThread returns
            TWO siblings — (1) a flex-1 list region that shrinks under
            the compact-mode squeeze, and (2) a shrink-0 form region
            (textarea + Add-comment CTA) that stays fully visible. The
            article's flex-column places them in order; the BlockStrip
            below stays pinned at the very bottom as the visible
            footer. The fragment is intentional: the form must NOT be
            inside the overflow-hidden list region or the CTA clips. */}
        <CommentsThread
          ticketId={item.id}
          comments={item.comments}
          onAdd={onAddComment}
          onComposingChange={setComposingComment}
          // Intake #926: drop the flex-1 wrapper in expanded mode so
          // the discussion heading sits flush against the prior
          // section instead of stretching to fill leftover article
          // height. Same showDetails value drives the article's clip
          // lift, so this stays in lockstep.
          expanded={showDetails}
        />

        {/* Intake #541: "Logical next" strip — the inverse of blocked-by.
            Shows what OTHER tickets are blocked by THIS one (i.e. what
            becomes workable when this ships). Renders one line in compact
            mode (#N title · +M more), expands to the full list when the
            card is showing details. Hidden for terminal-state tickets
            and when nothing is downstream. */}
        {blocks.length > 0
          && item.state !== "shipped" && item.state !== "declined" && item.state !== "duplicate" && item.state !== "provisioned" && (
          <LogicalNextStrip blocks={blocks} expanded={showDetails} />
        )}
        {/* Intake #140 (revised, final): block-status strip pinned at
            the bottom of the article. Hidden for terminal-state
            tickets (shipped / declined / duplicate / provisioned) —
            block tracking is irrelevant once the ticket has left the
            active queue, so it shouldn't take footer space. Active-
            state tickets always render the strip so the control is
            one click away. */}
        {item.state !== "shipped" && item.state !== "declined" && item.state !== "duplicate" && item.state !== "provisioned" && (
          <BlockStrip
            status={item.blockStatus}
            blockedBySeq={item.blockedBySeq}
            blockedByTitle={item.blockedByTitle}
            open={blockOpen}
            onToggleOpen={() => setBlockOpen((o) => !o)}
            statusDraft={blockStatusDraft}
            setStatusDraft={setBlockStatusDraft}
            seqDraft={blockSeqDraft}
            setSeqDraft={setBlockSeqDraft}
            onSubmit={submitBlock}
          />
        )}
        {/* Intake #199: free-form related-tickets strip. Always
            renders when there are links so the connection is visible
            at a glance; the +Add affordance is gated to expanded
            mode so compact cards stay quiet. */}
        <RelatedStrip itemId={item.id} canEdit={showDetails} />
        {/* Intake #197: post-creation image attachments. Gated on
            showDetails to match the in-card screenshot block above —
            thumbnails are media-weight; compact cards keep just the
            text-row strips. */}
        {showDetails && <AttachmentsStrip itemId={item.id} canEdit={showDetails} />}
    </ReviewCard>
  );
}
