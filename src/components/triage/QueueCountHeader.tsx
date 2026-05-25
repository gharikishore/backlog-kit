// Specforge intake #1026 (2026-05-25): the kit's default backlog mount
// dropped the per-page selector entirely — render all items in one
// scroll. This component is the small "Showing N" header that
// replaces the old PaginationBar at the top of the list.
//
// Two presentations:
//   - All items rendered:  "Showing 42"
//   - Cap hit:             "Showing 200 of 1026"
//
// Consumers wire it like:
//   <QueueCountHeader shown={items.length} total={total} />

export function QueueCountHeader({
  shown,
  total,
}: {
  shown: number;
  total: number;
}) {
  const capped = total > shown;
  return (
    <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.15em] opacity-65">
      Showing <span style={{ color: "#1A1814" }}>{shown}</span>
      {capped && (
        <>
          {" "}of <span style={{ color: "#1A1814" }}>{total}</span>
        </>
      )}
    </div>
  );
}
