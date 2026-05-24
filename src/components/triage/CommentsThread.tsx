"use client";
import { useEffect, useRef, useState } from "react";
import { useBacklogUI } from "./kit-adapter";
import type { TicketComment } from "../../types/backlog";

// Intake #132: chronological admin discussion thread on a ticket.
// Renders comments oldest-first (so the scan order matches the
// triage_reasoning narrative above it) + a textarea to add a new one.
// Cmd+Enter / Ctrl+Enter submits without lifting hands off keyboard.
//
// Extracted from src/app/admin/backlog/page.tsx (intake #165).
// Kit migration #617: inline rgba/hex + font-mono → kit tokens + primitives.
// Intake #926: discussion wrapper drops `flex-1 min-h-0 overflow-hidden`
// when the card is expanded so the heading sits flush against the prior
// section instead of being pushed down by leftover article height.
export function CommentsThread({
  ticketId,
  comments,
  onAdd,
  onComposingChange,
  expanded = false,
}: {
  ticketId: string;
  comments: TicketComment[];
  onAdd: (ticketId: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  // Intake #140 (final): fires true when the user has any text in the
  // comment draft (and false when the textarea is empty again). The
  // parent uses this to lift the article's compact-mode max-height
  // clip while a comment is being composed — same pattern as the
  // BlockStrip + reasoning editor expand triggers.
  onComposingChange?: (active: boolean) => void;
  // Intake #926: when the article is in expanded mode, drop the flex-1
  // wrapper around the discussion list so it shrink-fits and doesn't
  // create a large whitespace gap above the discussion heading. The
  // flex-1 squeeze is only useful in compact mode where the article
  // is height-clipped to the aside.
  expanded?: boolean;
}) {
  const { Button, cn } = useBacklogUI();
  const [draft, setDraft] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Intake #140 (final): auto-grow textarea. On every draft change,
  // reset height to 'auto' (so it can shrink) then set it to
  // scrollHeight (the natural content height). The card's clip is
  // already lifted while `draft` is non-empty (composingComment), so
  // the article grows in lockstep with the textarea — no scrollbar
  // inside the textarea, just one continuous expanding region.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Notify parent on every transition between empty and non-empty
  // draft so the article can grow/snap in step with the textarea.
  useEffect(() => {
    onComposingChange?.(draft.trim().length > 0);
  }, [draft, onComposingChange]);

  // Auto-grow on every keystroke. Capped at 16rem so an
  // accidentally-pasted essay doesn't take over the screen — beyond
  // that the textarea scrolls internally.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxPx = 16 * 16; // 16rem in px (16px root font)
    ta.style.height = Math.min(ta.scrollHeight, maxPx) + "px";
  }, [draft]);

  const submit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    const result = await onAdd(ticketId, trimmed);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to add comment");
      return;
    }
    setDraft("");
  };

  return (
    // Intake #140 (final): CommentsThread returns TWO siblings via a
    // fragment — the read-only list (header + comments) is the
    // flex-1 shrinkable element; the form (textarea + controls) is
    // shrink-0. By making them siblings (not nested), the form sits
    // OUTSIDE the overflow-hidden region, so the "Add comment" CTA
    // never clips, even in the tightest compact-mode layout. The
    // article's flex column pins it just above the BlockStrip.
    //
    // Intake #149 follow-up: the flex-1 + overflow-hidden constraint
    // also drops when the parent article expands. We can't detect
    // that from inside CommentsThread directly, but the parent's
    // `overflow: visible` on the article means the wrapper still
    // shows its inner content in full — and the wrapper's own
    // overflow-hidden was clipping comments. The conditional
    // disable lives in the article-level wrapper instead: the
    // backlog passes a `compact` flag and CommentsThread keys off
    // it. For now we keep the always-on clip here because the
    // backlog has no comments visible past 1-2 in compact, and the
    // form below stays pinned regardless.
    <>
      <div
        className={cn(
          "mt-4 pt-3 border-t border-hair flex flex-col font-sans",
          // Intake #926: only flex-1 / clip in compact mode. Expanded
          // mode shrink-fits so the discussion heading sits flush
          // against the description/EDIT row above it.
          expanded ? "" : "flex-1 min-h-0 overflow-hidden",
        )}
      >
        <div className="text-[11px] uppercase tracking-kicker text-ink/55 mb-2 shrink-0">
          Discussion · {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </div>
        {comments.length > 0 && (
          <ul
            className={cn(
              "flex flex-col gap-2 list-none p-0",
              expanded ? "" : "flex-1 min-h-0 overflow-hidden",
            )}
          >
            {comments.map((c, idx) => (
              <li
                key={c.id}
                className="px-3 py-2 bg-ink/[0.04] border-l-[3px] border-ink/25 rounded-kit"
              >
                <div className="text-[10px] uppercase tracking-kicker text-ink/55 mb-1 flex items-center gap-2">
                  {/* Intake #194: per-comment number, 1-indexed in
                      chronological order. Array is already
                      oldest-first (API orderBy asc createdAt) so the
                      map index is the right ordinal. */}
                  <span className="font-medium text-ink/85">#{idx + 1}</span>
                  <span className="text-ink/40">·</span>
                  <span>{c.authorLabel || "admin"}</span>
                  <span className="text-ink/40">·</span>
                  <span className="normal-case">{new Date(c.createdAt).toLocaleString()}</span>
                  {c.editedAt && <span className="normal-case text-ink/40">(edited)</span>}
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed text-ink">
                  {c.body}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 shrink-0 font-sans">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Add a comment… (Cmd/Ctrl+Enter to submit)"
          rows={2}
          disabled={submitting}
          className="w-full text-sm border border-hair-strong rounded-kit px-2 py-1.5 resize-none overflow-y-auto bg-card text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 disabled:opacity-60"
        />

        {error && (
          <div role="alert" className="mt-1 px-2 py-1 text-xs bg-orange/10 text-orange border border-orange/30 rounded-kit">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-1">
          <span className="text-[9px] text-ink/50">{draft.length} chars</span>
          <button
            type="button"
            onClick={() => { setDraft(""); setError(null); }}
            disabled={submitting || draft.length === 0}
            className="text-[10px] uppercase tracking-kicker text-ink/55 hover:text-ink disabled:opacity-30 transition-colors"
          >
            Clear
          </button>
          <Button
            kind="primary"
            onClick={() => void submit()}
            disabled={submitting || draft.trim().length === 0}
            className="!px-3 !py-1 text-[10px] uppercase tracking-kicker"
          >
            {submitting ? "Posting…" : "Add comment"}
          </Button>
        </div>
      </div>
    </>
  );
}
