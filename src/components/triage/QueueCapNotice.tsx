// Specforge intake #1026 (2026-05-25): orange footer notice that
// surfaces when the queue exceeds the render cap. Always renders the
// "showing first N of M" affordance + a prompt to refine filters so
// the cap is never silent.
//
// Consumer renders it conditionally:
//   {total > items.length && (
//     <QueueCapNotice shown={items.length} total={total} />
//   )}

export function QueueCapNotice({
  shown,
  total,
  /** Override the default "refine filters above" call-to-action. */
  refineHint = "refine filters above to narrow the queue.",
}: {
  shown: number;
  total: number;
  refineHint?: string;
}) {
  return (
    <div className="mt-4 p-3 rounded-kit border border-orange/30 bg-orange/5 font-mono text-[11px] uppercase tracking-[0.15em] text-ink/65">
      Showing first <span style={{ color: "#1A1814" }}>{shown}</span> of <span style={{ color: "#1A1814" }}>{total}</span> — {refineHint}
    </div>
  );
}
