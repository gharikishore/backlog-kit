"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, X, Plus } from "lucide-react";

// Intake #199: free-form "related tickets" links on a backlog card.
// Self-contained — owns its own data fetching against
// /api/admin/backlog/[id]/related so the parent card doesn't have to
// thread state through. Bidirectional storage: the API normalises the
// pair and we render whatever the GET returns.
//
// Rendering shape:
//   resting (always shown when there are links) — "Related: #N · #M"
//   composer (toggled with the + button) — small seq-number input
//
// Tones match the duplicate-of pill: muted neutral, distinct from the
// state colors. The pill on each related ticket links to the
// /admin/backlog?q=%23N filter so the admin can navigate by click.

type RelatedItem = {
  linkId: string;
  otherId: string;
  seq: number;
  title: string | null;
  summary: string | null;
  description: string;
  state: string;
  kind: string;
};

export function RelatedStrip({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const [items, setItems] = useState<RelatedItem[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [seqDraft, setSeqDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/backlog/${itemId}/related`, { cache: "no-store" });
      const data = await r.json();
      if (r.ok) setItems((data.items ?? []) as RelatedItem[]);
    } catch {
      // Silent — the strip degrades to "no related" until the next refetch.
    }
  }, [itemId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function submit() {
    const n = parseInt(seqDraft.replace(/^#/, "").trim(), 10);
    if (!Number.isFinite(n)) {
      setError("Enter a ticket number (e.g. 151 or #151).");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/admin/backlog/${itemId}/related`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relatedSeq: n }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? `Add failed (${r.status})`);
        return;
      }
      setSeqDraft("");
      setComposing(false);
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(linkId: string) {
    setSubmitting(true);
    try {
      await fetch(`/api/admin/backlog/${itemId}/related?linkId=${linkId}`, { method: "DELETE" });
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  // Resting render path. Hide the whole strip on cards with no links
  // and no edit affordance — nothing useful to show.
  if (items === null) return null;
  if (items.length === 0 && !canEdit) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap font-mono text-[11px] uppercase tracking-[0.15em]">
      <span className="opacity-55 flex items-center gap-1.5">
        <Link2 size={11} />
        Related:
      </span>
      {items.length === 0 && (
        <span className="opacity-50 normal-case tracking-normal italic">none</span>
      )}
      {items.map((r) => (
        <span
          key={r.linkId}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded normal-case tracking-normal"
          style={{ color: "#7a766f", backgroundColor: "rgba(122, 118, 111, 0.10)" }}
        >
          <a
            href={`/admin/backlog?q=%23${r.seq}`}
            className="hover:opacity-100 opacity-90"
            title={r.title ?? r.summary ?? r.description.slice(0, 80)}
          >
            #{r.seq}
          </a>
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(r.linkId)}
              disabled={submitting}
              className="opacity-50 hover:opacity-90"
              title="Remove related link"
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {canEdit && !composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-1 opacity-60 hover:opacity-100 normal-case tracking-normal"
        >
          <Plus size={11} /> Add related
        </button>
      )}
      {canEdit && composing && (
        <span className="inline-flex items-center gap-1.5">
          <input
            type="text"
            value={seqDraft}
            onChange={(e) => { setSeqDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submit(); }
              if (e.key === "Escape") { setComposing(false); setSeqDraft(""); setError(null); }
            }}
            placeholder="#151"
            className="font-mono normal-case tracking-normal text-[12px] px-2 py-0.5 rounded border w-[80px]"
            style={{ borderColor: "rgba(26,24,20,0.2)", backgroundColor: "white" }}
            autoFocus
            disabled={submitting}
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-80 hover:opacity-100"
          >
            add
          </button>
          <button
            type="button"
            onClick={() => { setComposing(false); setSeqDraft(""); setError(null); }}
            className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-50 hover:opacity-90"
          >
            cancel
          </button>
          {error && (
            <span className="font-mono text-[10px] normal-case tracking-normal" style={{ color: "#7a1f1f" }}>
              {error}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
