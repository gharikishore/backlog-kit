"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Star, Trash2, X } from "lucide-react";
import { useBacklogUI } from "./kit-adapter";

// Intake #533: saved filter views toolbar on /admin/backlog.
// Cross-device synced via /api/admin/backlog/views (DB-backed, per-
// user). Renders a dropdown of saved views + "Save current" button.
//
// Caller passes:
//   filterState: a serializable snapshot of every filter the page tracks
//   onApply:     called when the user picks a saved view; receives the
//                stored filterState bundle to restore
//   onHydrate:   called ONCE on mount with the default-or-last filter
//                state (whichever wins per the page-load precedence).
//                Caller applies it to restore page state.
//   syncDebounceMs: how long to wait after a filter change before
//                writing it back as "last used". Default 800.
//
// The toolbar self-fetches + self-debounces; the caller just supplies
// the current snapshot.

type View = {
  id: string;
  name: string;
  filterState: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  filterState: Record<string, unknown>;
  onApply: (state: Record<string, unknown>) => void;
  onHydrate: (state: Record<string, unknown>) => void;
  syncDebounceMs?: number;
};

export function BacklogViewsToolbar({ filterState, onApply, onHydrate, syncDebounceMs = 800 }: Props) {
  const { Button } = useBacklogUI();
  const [views, setViews] = useState<View[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveDraft, setSaveDraft] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeViewName, setActiveViewName] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const lastSyncedRef = useRef<string>("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/backlog/views", { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      setViews(data.views ?? []);
      return data;
    } catch {}
  }, []);

  // Initial hydration — fetch + apply default-or-last on first mount.
  useEffect(() => {
    void (async () => {
      const data = await refresh();
      if (!data || hydratedRef.current) return;
      hydratedRef.current = true;
      const candidate = data.defaultView?.filterState ?? data.lastFilterState ?? null;
      if (candidate && typeof candidate === "object") {
        onHydrate(candidate);
        if (data.defaultView) setActiveViewName(data.defaultView.name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced PUT to /views/last whenever filterState changes after
  // hydration. Skips the first run + skips redundant writes (same JSON
  // as last sync).
  useEffect(() => {
    if (!hydratedRef.current) return;
    const json = JSON.stringify(filterState);
    if (json === lastSyncedRef.current) return;
    const t = setTimeout(() => {
      lastSyncedRef.current = json;
      void fetch("/api/admin/backlog/views/last", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filterState }),
      });
    }, syncDebounceMs);
    return () => clearTimeout(t);
  }, [filterState, syncDebounceMs]);

  const onPickView = (v: View) => {
    onApply(v.filterState);
    setActiveViewName(v.name);
    setOpen(false);
  };

  const onSetDefault = async (v: View, e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    try {
      await fetch(`/api/admin/backlog/views/${v.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isDefault: !v.isDefault }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const onDelete = async (v: View, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete view "${v.name}"?`)) return;
    setError(null);
    try {
      await fetch(`/api/admin/backlog/views/${v.id}`, { method: "DELETE" });
      if (activeViewName === v.name) setActiveViewName(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onSaveNew = async () => {
    const name = saveDraft.trim();
    if (!name) { setError("Name required."); return; }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/backlog/views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, filterState }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? `Save failed (${r.status})`);
      setSaveDraft("");
      setSavingPrompt(false);
      setActiveViewName(name);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1.5 flex-wrap">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[11px] uppercase tracking-kicker px-2 py-1 rounded border border-hair hover:bg-ink/5 inline-flex items-center gap-1.5 bg-card"
          title="Saved views"
        >
          View: {activeViewName ?? <span className="text-ink/55">unsaved</span>}
          <ChevronDown size={11} />
        </button>
        {open && (
          <div
            className="absolute z-40 top-full left-0 mt-1 min-w-[220px] max-w-[320px] bg-card border border-hair-strong rounded-kit shadow-kit py-1"
            onClick={() => setOpen(false)}
          >
            {views.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-ink/55">No saved views yet.</div>
            ) : (
              views.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onPickView(v)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-ink/5 text-[13px]"
                >
                  <span className="flex-1 truncate">{v.name}</span>
                  {v.isDefault && (
                    <span className="font-mono text-[9px] uppercase tracking-kicker text-ink/55">default</span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => void onSetDefault(v, e)}
                    title={v.isDefault ? "Unset as default" : "Set as default"}
                    className="p-0.5 rounded hover:bg-ink/10"
                  >
                    <Star size={11} fill={v.isDefault ? "currentColor" : "none"} className={v.isDefault ? "text-ink" : "text-ink/40"} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void onDelete(v, e)}
                    title="Delete view"
                    className="p-0.5 rounded hover:bg-ink/10 text-ink/45 hover:text-ink"
                  >
                    <Trash2 size={11} />
                  </button>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {!savingPrompt ? (
        <Button kind="subtle" onClick={() => setSavingPrompt(true)} className="!text-[10px] !uppercase !tracking-kicker">
          <Plus size={11} /> Save current
        </Button>
      ) : (
        <div className="inline-flex items-center gap-1">
          <input
            value={saveDraft}
            onChange={(e) => setSaveDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void onSaveNew(); }
              if (e.key === "Escape") { setSavingPrompt(false); setSaveDraft(""); setError(null); }
            }}
            placeholder="View name…"
            autoFocus
            disabled={saving}
            maxLength={80}
            className="font-sans text-[12px] px-2 py-1 rounded border focus:outline-none focus:ring-2 focus:ring-ink/30"
            style={{ borderColor: "rgba(26,24,20,0.18)", backgroundColor: "white", width: "140px" }}
          />
          <Button kind="primary" onClick={() => void onSaveNew()} disabled={saving} className="!text-[10px] !uppercase !tracking-kicker">
            Save
          </Button>
          <button
            type="button"
            onClick={() => { setSavingPrompt(false); setSaveDraft(""); setError(null); }}
            disabled={saving}
            className="p-1 text-ink/55 hover:text-ink"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {error && (
        <span className="font-mono text-[10px]" style={{ color: "#7a1f1f" }}>{error}</span>
      )}
    </div>
  );
}
