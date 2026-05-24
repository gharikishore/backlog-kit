"use client";

// defaultBacklogUIAdapter — sane fallbacks for the BacklogUIAdapter
// context so a fresh consumer can mount the kit's BacklogCard /
// triage primitives without having to build a Button + Lozenge + cn
// + identity helper + reasoning renderer from scratch (intake #986).
//
// Specforge keeps its own adapter (specforgeBacklogUIAdapter) because
// it wires Vellum's Button + Lozenge + handleOrRole + 3-section
// ReasoningSections — too project-specific to move into the kit.
// Other consumers (hmbr-starter, future projects) get this default
// adapter via <BacklogPage />'s internal mount.

import type { CSSProperties, ReactNode } from "react";
import type {
  BacklogUIAdapter,
  IdentityCandidate,
  KitButtonProps,
  KitLozengeProps,
  ReasoningSectionsProps,
} from "./kit-adapter";

// Minimal classname combiner — no dep on clsx / tailwind-merge.
// Joins truthy strings with spaces. Good enough for the kit's
// primitives which use static class lists.
export function defaultCn(...args: unknown[]): string {
  return args
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join(" ");
}

// Themable Button — uses --ft-* CSS vars for colors. Tonality + kind
// + size mirror Vellum's <Button> contract so consumer call-sites that
// pass kind/tone/size keep working without changes.
function DefaultButton({
  kind = "subtle",
  tone = "default",
  size = "md",
  onClick,
  disabled,
  type = "button",
  className = "",
  style,
  title,
  children,
  "aria-label": ariaLabel,
}: KitButtonProps) {
  const sizePx =
    size === "sm"
      ? { padX: 8, padY: 4, fontSize: 12 }
      : size === "lg"
        ? { padX: 14, padY: 8, fontSize: 14 }
        : { padX: 10, padY: 6, fontSize: 13 };

  // Resolve color tokens per kind. `tone` overrides accent color for
  // primary/secondary; subtle/ghost always use neutral.
  const toneAccent =
    tone === "success"
      ? "var(--ft-success)"
      : tone === "danger"
        ? "var(--ft-error-fg)"
        : "var(--ft-accent)";

  let s: CSSProperties = {
    padding: `${sizePx.padY}px ${sizePx.padX}px`,
    fontSize: `${sizePx.fontSize}px`,
    borderRadius: 6,
    border: "1px solid transparent",
    fontFamily: "inherit",
    fontWeight: 500,
    lineHeight: 1.2,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "background-color 120ms, border-color 120ms",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    ...style,
  };

  if (kind === "primary") {
    s = {
      ...s,
      background: toneAccent,
      color:
        tone === "success" ? "var(--ft-success-on)" : "var(--ft-bubble-fg)",
      borderColor: toneAccent,
    };
  } else if (kind === "secondary") {
    s = {
      ...s,
      background: "var(--ft-card)",
      color: "var(--ft-ink)",
      borderColor: "var(--ft-hair-strong)",
    };
  } else if (kind === "danger") {
    s = {
      ...s,
      background: "var(--ft-error-bg)",
      color: "var(--ft-error-fg)",
      borderColor: "var(--ft-error-fg)",
    };
  } else if (kind === "ghost") {
    s = {
      ...s,
      background: "transparent",
      color: "var(--ft-text-soft)",
      borderColor: "transparent",
    };
  } else {
    // subtle (default)
    s = {
      ...s,
      background: "transparent",
      color: "var(--ft-ink)",
      borderColor: "var(--ft-hair)",
    };
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={s}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

// Themable Lozenge / pill — tone maps to bg + fg pair using --ft-*
// status vars. Compact, rounded-full, mono uppercase.
function DefaultLozenge({
  tone = "default",
  size = "md",
  icon,
  className = "",
  children,
}: KitLozengeProps) {
  const padX = size === "sm" ? 6 : 8;
  const padY = size === "sm" ? 1 : 2;
  const fontSize = size === "sm" ? 9 : 10;

  const tones: Record<string, { bg: string; fg: string; border: string }> = {
    default: {
      bg: "var(--ft-card)",
      fg: "var(--ft-text-muted)",
      border: "var(--ft-hair-strong)",
    },
    success: {
      bg: "color-mix(in srgb, var(--ft-success) 12%, transparent)",
      fg: "var(--ft-success)",
      border: "color-mix(in srgb, var(--ft-success) 25%, transparent)",
    },
    warning: {
      bg: "color-mix(in srgb, var(--ft-accent-idea) 15%, transparent)",
      fg: "var(--ft-accent-idea)",
      border: "color-mix(in srgb, var(--ft-accent-idea) 30%, transparent)",
    },
    danger: {
      bg: "var(--ft-error-bg)",
      fg: "var(--ft-error-fg)",
      border: "var(--ft-error-fg)",
    },
    info: {
      bg: "color-mix(in srgb, var(--ft-accent) 12%, transparent)",
      fg: "var(--ft-accent)",
      border: "color-mix(in srgb, var(--ft-accent) 25%, transparent)",
    },
    muted: {
      bg: "var(--ft-surface)",
      fg: "var(--ft-text-soft)",
      border: "var(--ft-hair)",
    },
  };
  const t = tones[tone] ?? tones.default;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: `${padY}px ${padX}px`,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        borderRadius: 999,
        fontFamily: "ui-monospace, monospace",
        fontSize,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        lineHeight: 1,
      }}
    >
      {icon as ReactNode}
      {children}
    </span>
  );
}

// Identity helper — fallback chain: publicHandle → displayName → email
// → "Unknown". Specforge overrides this to use handleOrRole() (never
// shows email or name on non-self surfaces). Other consumers may want
// to allow names — they override per-project.
function defaultLabelForUser(u: IdentityCandidate | null | undefined): string {
  if (!u) return "Unknown";
  if (u.publicHandle) return u.publicHandle;
  if (u.displayName) return u.displayName;
  if (u.email) return u.email;
  return "Unknown";
}

// ReasoningSections default — renders raw text as `<pre>`. Specforge
// overrides this with a 3-section `## Suggestions / ## Follow-ups /
// ## Final decision` renderer (intake #86). Consumers who want the
// rich rendering can copy specforge's <ReasoningSections>.
function DefaultReasoningSections({ text, className }: ReasoningSectionsProps) {
  if (!text) {
    return (
      <div
        className={className}
        style={{
          fontFamily: "inherit",
          fontSize: 13,
          color: "var(--ft-text-soft)",
          fontStyle: "italic",
        }}
      >
        No reasoning yet.
      </div>
    );
  }
  return (
    <pre
      className={className}
      style={{
        fontFamily: "inherit",
        fontSize: 13,
        color: "var(--ft-ink)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
      }}
    >
      {text}
    </pre>
  );
}

// 3-section skeleton injector. Default: no-op (returns input unchanged).
// Consumers using the convention override this to inject the template.
function defaultEnsureTemplateSections(text: string): string {
  return text;
}

/**
 * Sensible defaults for the BacklogUIAdapter — themable via --ft-* vars,
 * no dependency on a specific UI kit (Vellum / shadcn / chakra / etc.).
 * Mount via <BacklogPage /> for the full drop-in, or use directly:
 *
 *   import { defaultBacklogUIAdapter, BacklogUIProvider } from
 *     "@local/backlog-kit/components/triage";
 *
 *   <BacklogUIProvider value={defaultBacklogUIAdapter()}>
 *     <BacklogCard ... />
 *   </BacklogUIProvider>
 *
 * Override individual pieces by spreading + replacing:
 *
 *   const adapter: BacklogUIAdapter = {
 *     ...defaultBacklogUIAdapter(),
 *     labelForUser: myCustomIdentityRenderer,
 *   };
 */
export function defaultBacklogUIAdapter(): BacklogUIAdapter {
  return {
    Button: DefaultButton,
    Lozenge: DefaultLozenge,
    cn: defaultCn,
    labelForUser: defaultLabelForUser,
    ReasoningSections: DefaultReasoningSections,
    ensureTemplateSections: defaultEnsureTemplateSections,
  };
}
