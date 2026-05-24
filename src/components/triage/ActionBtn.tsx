"use client";
import { useBacklogUI } from "./kit-adapter";

// Shared per-card action button for /admin/backlog (PENDING / ACCEPT /
// READY / SHIP / DECLINE / DUPLICATE / BLOCK). Kit-aligned shape — same
// rounded-kit-sm corner radius, hairline border, hover + focus + disabled
// states as <Button> — but takes a per-state `activeColor` hex because the
// 7 visible action colors don't map onto the kit's 4 Button kinds.
//
// Caller passes the hex (typically from STATE_TONE) and an optional
// `activeFg` (defaults to cream for legibility against the colored bg).
export type ActionBtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  activeColor: string;
  activeFg?: string;
};

export function ActionBtn({
  active,
  activeColor,
  activeFg = "#F2EDE4",
  className,
  type = "button",
  style,
  children,
  ...rest
}: ActionBtnProps) {
  const { cn } = useBacklogUI();
  const activeStyle = active
    ? {
        borderColor: activeColor,
        backgroundColor: activeColor,
        color: activeFg,
        ...style,
      }
    : style;
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-kit-sm border font-mono text-[12px] uppercase tracking-[0.12em] transition-colors whitespace-nowrap",
        !active && "border-hair-strong text-ink bg-transparent hover:bg-ink/5",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-ink/30",
        className,
      )}
      style={activeStyle}
      {...rest}
    >
      {children}
    </button>
  );
}
