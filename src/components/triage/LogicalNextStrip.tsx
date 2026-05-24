import { ArrowRight } from "lucide-react";
import type { Item } from "../../types/backlog";

// Intake #541: "Logical next" — surfaces the inverse blocked_by edge.
// Each card with at least one downstream pending/accepted/ready_to_ship
// ticket shows this strip so the user can see at-a-glance what becomes
// workable when this card ships. Mirror of the BlockStrip's "Blocked
// until #N — title" pattern, going the other direction.
//
// Compact mode: one line — "Logical next: #N title · +M more" where M
// is the remaining count.
// Expanded mode (showDetails): full list, each downstream as its own
// row with state lozenge — same shape as the "Blocked by" panel.
//
// Click on any #N scrolls to that card via `id="intake-{seq}"` set on
// the page's render loop wrapper.
export function LogicalNextStrip({
  blocks,
  expanded,
}: {
  blocks: Array<{ id: string; seq: number; title: string | null; state: Item["state"] }>;
  expanded: boolean;
}) {
  if (blocks.length === 0) return null;

  const first = blocks[0];
  const rest = blocks.length - 1;

  const scrollTo = (seq: number) => {
    const el = document.getElementById(`intake-${seq}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Brief highlight so the user knows where they landed.
    const prev = el.style.transition;
    el.style.transition = "box-shadow 200ms ease-out";
    el.style.boxShadow = "0 0 0 3px rgba(26, 58, 120, 0.35)";
    setTimeout(() => {
      el.style.boxShadow = "";
      setTimeout(() => { el.style.transition = prev; }, 250);
    }, 900);
  };

  // Compact mode — single line summarizing the chain.
  if (!expanded) {
    return (
      <div
        className="mt-4 mb-1 px-3 py-2 border flex items-center gap-2 flex-wrap font-mono text-[11px]"
        style={{ borderColor: "rgba(34, 102, 51, 0.30)", borderRadius: 4, background: "rgba(34, 102, 51, 0.04)" }}
      >
        <ArrowRight size={12} style={{ color: "#226633" }} />
        <span className="uppercase tracking-[0.15em]" style={{ color: "#226633" }}>
          Logical next
        </span>
        <button
          type="button"
          onClick={() => scrollTo(first.seq)}
          className="opacity-90 hover:opacity-100 underline-offset-2 hover:underline normal-case"
          title={`Jump to #${first.seq}`}
          style={{ color: "#1A1814" }}
        >
          #{first.seq}
          {first.title && <span className="opacity-75"> — {first.title}</span>}
        </button>
        {rest > 0 && (
          <span className="opacity-60 normal-case">
            · +{rest} more
          </span>
        )}
      </div>
    );
  }

  // Expanded mode — full list, mirrors the "Blocked by" panel pattern.
  return (
    <div
      className="mt-4 mb-1 px-3 py-2 border flex flex-col gap-1.5"
      style={{ borderColor: "rgba(34, 102, 51, 0.30)", borderRadius: 4, background: "rgba(34, 102, 51, 0.04)" }}
    >
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: "#226633" }}>
        <ArrowRight size={12} />
        <span>Will unblock when shipped</span>
        <span className="opacity-60 normal-case">· {blocks.length} ticket{blocks.length === 1 ? "" : "s"}</span>
      </div>
      <ul className="flex flex-col gap-1 mt-1">
        {blocks.map((b) => (
          <li key={b.id} className="flex items-baseline gap-2 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => scrollTo(b.seq)}
              className="opacity-90 hover:opacity-100 underline-offset-2 hover:underline normal-case text-left"
              title={`Jump to #${b.seq}`}
              style={{ color: "#1A1814" }}
            >
              #{b.seq}
              {b.title && <span className="opacity-75"> — {b.title}</span>}
            </button>
            <span
              className="ml-auto px-1.5 py-0.5 uppercase tracking-[0.15em] flex-shrink-0"
              style={{
                fontSize: 9,
                color: b.state === "accepted" ? "#226633" : b.state === "ready_to_ship" ? "#C5421B" : "#7a4f1f",
                backgroundColor:
                  b.state === "accepted" ? "rgba(34,102,51,0.10)"
                  : b.state === "ready_to_ship" ? "rgba(197,66,27,0.10)"
                  : "rgba(122,79,31,0.10)",
              }}
            >
              {b.state === "ready_to_ship" ? "ready" : b.state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
