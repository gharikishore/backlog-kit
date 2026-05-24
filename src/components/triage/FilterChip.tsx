"use client";
import { useBacklogUI } from "./kit-adapter";

// Filter-row chip for /admin/backlog. Used across BacklogPage (state,
// kind, has, sort). Tone modulates the active fill — color carries
// meaning, not page (intake #198).
//   default → ink     (neutral/operational, e.g. All, Active, kind row)
//   success → green   (Has: yes, Accepted state)
//   danger  → red     (Has: no, Declined state)
//   orange  → orange  (Ready to ship / attention)
//   navy    → navy    (Shipped / archived done)
//   gold    → gold    (Pending / advisory)
//   muted   → grey    (Duplicate / terminal-uninteresting)
//
// Intake #597 (foundation for studio softening): two visual variants.
//   variant="admin"  → heavy fills (bg-ink, bg-orange, ...) for the
//                      operator triage surface where high contrast +
//                      clear selection is the point.
//   variant="studio" → soft tinted fills (bg-orange/15 + text-orange,
//                      etc.) for the creator/architect/process daily
//                      workbenches where the heavy ink-on-cream felt
//                      oppressive after long sessions.
// Default = "admin" so existing call sites are unaffected.
export type FilterChipProps = {
  active: boolean;
  tone?: "default" | "success" | "danger" | "orange" | "navy" | "gold" | "muted";
  variant?: "admin" | "studio";
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
};

const ACTIVE_TONE_ADMIN: Record<NonNullable<FilterChipProps["tone"]>, string> = {
  default: "bg-ink border-ink text-cream",
  success: "bg-success border-success text-cream",
  danger:  "bg-[#7a1f1f] border-[#7a1f1f] text-cream",
  orange:  "bg-orange border-orange text-cream",
  navy:    "bg-navy border-navy text-cream",
  gold:    "bg-gold border-gold text-cream",
  muted:   "bg-ink/55 border-ink/55 text-cream",
};

// Studio variant — soft tinted fills. Same meaning per tone; lighter
// presence on long-session workbench surfaces.
const ACTIVE_TONE_STUDIO: Record<NonNullable<FilterChipProps["tone"]>, string> = {
  default: "bg-ink/10 border-ink/40 text-ink",
  success: "bg-success/15 border-success/45 text-success",
  danger:  "bg-[#7a1f1f]/12 border-[#7a1f1f]/40 text-[#7a1f1f]",
  orange:  "bg-orange/15 border-orange/40 text-orange",
  navy:    "bg-navy/12 border-navy/40 text-navy",
  gold:    "bg-gold/20 border-gold/50 text-[#7a4f1f]",
  muted:   "bg-ink/8 border-ink/25 text-ink/70",
};

const INACTIVE_BASE = "border-hair-strong text-ink bg-transparent hover:bg-ink/5";

export function FilterChip({
  active,
  tone = "default",
  variant = "admin",
  onClick,
  title,
  children,
}: FilterChipProps) {
  const { cn } = useBacklogUI();
  const activeClass =
    variant === "studio" ? ACTIVE_TONE_STUDIO[tone] : ACTIVE_TONE_ADMIN[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "px-3 py-1 rounded-kit-sm border font-mono text-[11px] uppercase tracking-kicker transition-colors whitespace-nowrap",
        active ? activeClass : INACTIVE_BASE,
      )}
    >
      {children}
    </button>
  );
}
