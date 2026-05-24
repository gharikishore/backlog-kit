// Intake #101: pagination control. Renders "Showing N–M of T" + page-
// size picker + prev/next buttons. The footer instance hides the
// page-size picker (top-of-list controls cover that) so the bottom bar
// reads as just navigation.
//
// Extracted from src/app/admin/backlog/page.tsx (intake #165).
export function PaginationBar({
  page,
  pageSize,
  total,
  shown,
  pageSizes,
  onSetPage,
  onSetPageSize,
  showPageSizePicker = true,
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  pageSizes: ReadonlyArray<number>;
  onSetPage: (p: number) => void;
  onSetPageSize: (n: 10 | 20 | 50 | 100) => void;
  showPageSizePicker?: boolean;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(start + shown - 1, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <div className="flex items-center gap-3 mb-3 flex-wrap font-mono text-[11px] uppercase tracking-[0.15em]">
      <span className="opacity-65">
        Showing <span style={{ color: "#1A1814" }}>{start}–{end}</span> of <span style={{ color: "#1A1814" }}>{total}</span>
      </span>
      {showPageSizePicker && (
        <>
          <span className="opacity-50 ml-2">Per page:</span>
          {pageSizes.map((n) => (
            <button
              key={n}
              onClick={() => onSetPageSize(n as 10 | 20 | 50 | 100)}
              className="px-2 py-1 border"
              style={{
                borderColor: pageSize === n ? "#1A1814" : "rgba(26,24,20,0.2)",
                backgroundColor: pageSize === n ? "#1A1814" : "transparent",
                color: pageSize === n ? "#F2EDE4" : "#1A1814",
              }}
            >
              {n}
            </button>
          ))}
        </>
      )}
      <span className="ml-auto flex items-center gap-2">
        <button
          onClick={() => onSetPage(Math.max(1, page - 1))}
          disabled={!canPrev}
          className="px-3 py-1 border"
          style={{
            borderColor: canPrev ? "rgba(26,24,20,0.3)" : "rgba(26,24,20,0.1)",
            color: canPrev ? "#1A1814" : "rgba(26,24,20,0.4)",
            cursor: canPrev ? "pointer" : "default",
          }}
        >
          ← Prev
        </button>
        <span className="opacity-65">Page {page} / {totalPages}</span>
        <button
          onClick={() => onSetPage(Math.min(totalPages, page + 1))}
          disabled={!canNext}
          className="px-3 py-1 border"
          style={{
            borderColor: canNext ? "rgba(26,24,20,0.3)" : "rgba(26,24,20,0.1)",
            color: canNext ? "#1A1814" : "rgba(26,24,20,0.4)",
            cursor: canNext ? "pointer" : "default",
          }}
        >
          Next →
        </button>
      </span>
    </div>
  );
}
