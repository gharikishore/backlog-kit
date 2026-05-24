"use client";
import { Ban, PauseCircle } from "lucide-react";
import { useBacklogUI } from "./kit-adapter";

// Horizontal block-status strip in the card body (intake #140).
// Replaces the old aside-side BlockBtn + header parked/blocked pill —
// centralizes "this ticket is blocked / parked / not" into one row.

export function BlockStrip({
  status,
  blockedBySeq,
  blockedByTitle,
  open,
  onToggleOpen,
  statusDraft,
  setStatusDraft,
  seqDraft,
  setSeqDraft,
  onSubmit,
}: {
  status: "parked" | "blocked" | null;
  blockedBySeq: number | null;
  blockedByTitle: string | null;
  open: boolean;
  onToggleOpen: () => void;
  statusDraft: "" | "parked" | "blocked";
  setStatusDraft: (v: "" | "parked" | "blocked") => void;
  seqDraft: string;
  setSeqDraft: (v: string) => void;
  onSubmit: () => void;
}) {
  const { Button, Lozenge } = useBacklogUI();
  return (
    <div
      data-block-strip
      className="mt-6 mb-3 px-3 py-2 border border-hair rounded-kit bg-ink/[0.03] flex flex-col gap-1.5 font-sans"
    >
      <div className="flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-kicker text-ink/70">
        {status ? (
          <>
            <Lozenge tone={status === "blocked" ? "warning" : "info"} icon={status === "blocked" ? <Ban size={11} /> : <PauseCircle size={11} />}>
              {status === "blocked" ? "Blocked" : "Parked"}
            </Lozenge>
            {blockedBySeq != null ? (
              <span className="normal-case text-ink/75">
                {status === "blocked" ? "until" : "because of"} #{blockedBySeq}
                {blockedByTitle && <span className="text-ink/60"> — {blockedByTitle}</span>}
              </span>
            ) : (
              <span className="normal-case text-ink/55">(no ticket linked)</span>
            )}
            <button
              type="button"
              onClick={onToggleOpen}
              className="ml-auto text-ink/55 hover:text-ink transition-colors"
              title="Change block status"
            >
              {open ? "Cancel" : "Change"}
            </button>
          </>
        ) : (
          <>
            <span className="text-ink/45">Block</span>
            <button
              type="button"
              onClick={onToggleOpen}
              className="ml-auto normal-case text-ink/55 hover:text-ink transition-colors"
              title="Mark this ticket parked or blocked until another ticket ships"
            >
              {open ? "Cancel" : "Mark parked / blocked until…"}
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="flex items-end gap-2 mt-1 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-kicker text-ink/55">Status</span>
            <select
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value as "" | "parked" | "blocked")}
              className="border border-hair-strong rounded-kit px-2 py-1 text-sm bg-card text-ink font-sans outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
            >
              <option value="">— clear —</option>
              <option value="parked">Parked</option>
              <option value="blocked">Blocked until</option>
            </select>
          </label>
          {statusDraft !== "" && (
            <label className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-kicker text-ink/55">
                {statusDraft === "blocked" ? "Blocked until #" : "Related ticket #"}
                <span className="text-ink/40 normal-case lowercase ml-1">(optional)</span>
              </span>
              <input
                type="number"
                value={seqDraft}
                onChange={(e) => setSeqDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit(); } }}
                placeholder="seq#"
                className="border border-hair-strong rounded-kit px-2 py-1 text-sm font-sans bg-card text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 w-[110px]"
              />
            </label>
          )}
          <Button kind="primary" onClick={onSubmit} className="self-end !px-3 !py-1 text-[10px] uppercase tracking-kicker">
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
