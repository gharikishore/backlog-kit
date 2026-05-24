"use client";
import { useBacklogUI } from "./kit-adapter";
import { STATE_TONE } from "./constants";
import type { Item } from "../../types/backlog";

// State pill that surfaces an Item.state with its STATE_TONE color.
// Backlog-specific because STATE_TONE has 8 buckets — finer-grained than
// the kit's 5-tone <Lozenge>. Rendered as a span with inline color from
// the tone map; the only kit dependency is `cn` for class merging.

export type StateLozengeProps = {
  state: Item["state"];
  className?: string;
};

export function StateLozenge({ state, className }: StateLozengeProps) {
  const { cn } = useBacklogUI();
  const tone = STATE_TONE[state];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-[0.02em] whitespace-nowrap font-sans",
        className,
      )}
      style={{
        color: tone.fg,
        backgroundColor: tone.bg,
        borderColor: `${tone.fg}55`,
      }}
    >
      {tone.label}
    </span>
  );
}
