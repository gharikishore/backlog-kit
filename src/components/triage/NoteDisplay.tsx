"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useBacklogUI } from "./kit-adapter";

// Read-only render of a card's triage note — summary headline + optional
// full reasoning toggle. Hidden behind a "show full reasoning" expand
// when the card is in compact mode (intake #56 + #86).

export function NoteDisplay({
  summary,
  reasoning,
  toneFg,
  onEdit,
  forceShowFull = false,
}: {
  summary: string | null;
  reasoning: string | null;
  toneFg: string;
  onEdit: () => void;
  /** When parent is chevron-expanded, auto-show full reasoning (intake #149). */
  forceShowFull?: boolean;
}) {
  const { ReasoningSections } = useBacklogUI();
  const [expanded, setExpanded] = useState(false);
  const hasSummary = !!summary;
  const hasReasoning = !!reasoning;
  const showFull = expanded || forceShowFull;
  return (
    <div className="mt-3 border-l-2 pl-3 group" style={{ borderColor: toneFg, color: toneFg }}>
      {hasSummary ? (
        <p className="text-base leading-relaxed whitespace-pre-wrap break-words" style={{ overflowWrap: "anywhere" }}>
          {summary}
        </p>
      ) : (
        <ReasoningSections text={reasoning} className="text-base italic" />
      )}
      {hasSummary && hasReasoning && showFull && (
        <div className="mt-2 opacity-85">
          <ReasoningSections text={reasoning} className="text-sm italic" />
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-3 not-italic">
        {hasSummary && hasReasoning && !forceShowFull && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[11px] uppercase tracking-[0.15em] opacity-55 hover:opacity-100"
            title={expanded ? "Hide full reasoning" : "Show full reasoning"}
          >
            {expanded ? "Hide full reasoning" : "Show full reasoning"}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="font-mono text-[11px] uppercase tracking-[0.15em] opacity-55 hover:opacity-100 flex items-center gap-1"
          title="Edit note"
        >
          <Pencil size={11} /> Edit
        </button>
      </div>
    </div>
  );
}
