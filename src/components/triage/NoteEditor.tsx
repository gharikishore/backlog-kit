"use client";
import { Check, FileText } from "lucide-react";
import { useBacklogUI } from "./kit-adapter";
import { SUMMARY_MAX_CHARS } from "./constants";

// Triage note editor — summary headline + full reasoning textarea.
// Used when the admin clicks Edit on a card's note (intake #56 + #87).

export function NoteEditor({
  summaryDraft,
  reasoningDraft,
  onChangeSummary,
  onChangeReasoning,
  onSave,
  onCancel,
}: {
  summaryDraft: string;
  reasoningDraft: string;
  onChangeSummary: (s: string) => void;
  onChangeReasoning: (s: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { ensureTemplateSections } = useBacklogUI();
  const summaryLen = summaryDraft.length;
  const overLimit = summaryLen > SUMMARY_MAX_CHARS;
  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-60">Summary (one line)</label>
          <span
            className="font-mono text-[9px]"
            style={{ color: overLimit ? "#7a1f1f" : "rgba(26,24,20,0.5)" }}
          >
            {summaryLen}/{SUMMARY_MAX_CHARS}
          </span>
        </div>
        <input
          type="text"
          value={summaryDraft}
          onChange={(e) => onChangeSummary(e.target.value.slice(0, SUMMARY_MAX_CHARS))}
          placeholder="One-line headline (optional — scanned in the queue)"
          className="w-full bg-white border px-3 py-2 text-sm"
          style={{ borderColor: "rgba(26,24,20,0.3)" }}
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-60">Full reasoning</label>
          <button
            type="button"
            onClick={() => onChangeReasoning(ensureTemplateSections(reasoningDraft))}
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] opacity-60 hover:opacity-100"
            title="Insert the ## Suggestions / ## Follow-ups / ## Final decision skeleton (appends missing sections only)"
          >
            <FileText size={10} /> Use template
          </button>
        </div>
        <textarea
          value={reasoningDraft}
          onChange={(e) => onChangeReasoning(e.target.value)}
          placeholder="Forensic narrative — hidden behind 'show full reasoning' on the card, fully captured in history"
          rows={3}
          className="w-full bg-white border px-3 py-2 text-sm resize-y"
          style={{ borderColor: "rgba(26,24,20,0.3)" }}
        />
      </div>
      <div className="flex items-center gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-60 hover:opacity-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={overLimit}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] disabled:opacity-40"
          style={{ backgroundColor: "#1A1814", color: "#F2EDE4" }}
        >
          <Check size={10} /> Save note
        </button>
      </div>
    </div>
  );
}
