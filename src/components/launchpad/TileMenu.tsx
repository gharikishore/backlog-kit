"use client";

// Fiori-style launchpad tile menu. Originally lived in specforge's
// src/components/TileMenu.tsx (intake #72 — Fiori-style tile menu for
// admin landings; #154 — iPhone-like drag-to-reorder; #833 — section-
// grouped layout). Promoted into backlog-kit so other consumers
// (hmbr-starter, future projects) get the same admin launchpad
// affordance once they wire backlog-kit's AdminHeader/AdminLayout.
//
// Design rationale: each tile shows an icon + label + (optional) hint
// + (optional) KPI stat row. Renders as a responsive 1→2→3→4 column
// grid. When `orderKey` is supplied, tiles become draggable and the
// order persists to localStorage under `tile-order:<orderKey>` (or
// `tile-order:<orderKey>:<group.key>` in grouped mode).
//
// Theming: all colors come from --ft-* CSS variables (see
// default-theme.css). The kit ships defaults; consumers tune by
// overriding the vars in their globals.css.

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

export type Tile = {
  href: string;
  // Pre-rendered icon JSX. Parent renders e.g.
  //   <ListChecks size={40} strokeWidth={1.5} />
  // so this component can stay client-side without crossing a
  // server→client function-ref boundary.
  iconElement: ReactNode;
  label: string;
  hint?: string;
  stats?: Array<{ value: number | string; label: string }>;
};

// Section-grouped tile layout (specforge #833). When `groups` is
// passed, each group renders as a kicker heading + its own grid +
// (when orderKey is set) its own drag-reorder scope. Drags stay within
// a group so the section boundaries don't dissolve.
export type TileGroup = {
  // Stable key — used as a suffix on orderKey for per-group order
  // persistence ("studio-tiles:architect_l2:customer" etc.).
  key: string;
  // Kicker text shown above the group (uppercase mono).
  label: string;
  // Optional sub-line under the kicker. Plain prose.
  hint?: string;
  tiles: Tile[];
};

export type TileMenuProps = {
  title: string;
  subtitle?: string;
  // Small uppercase kicker rendered above the title (e.g. brand name,
  // section name). Optional — omit for a plain title.
  brandKicker?: string;
  // Flat layout — used by /admin and legacy callers.
  tiles?: Tile[];
  // Grouped layout — used by /studio. Mutually exclusive with `tiles`;
  // if both are passed `groups` wins.
  groups?: TileGroup[];
  // Optional: when set, tiles are draggable and order persists to
  // localStorage under `tile-order:<orderKey>` (flat) or
  // `tile-order:<orderKey>:<group.key>` (grouped).
  orderKey?: string;
};

export function TileMenu({
  title,
  subtitle,
  brandKicker,
  tiles,
  groups,
  orderKey,
}: TileMenuProps) {
  const draggable = !!orderKey;
  const isGrouped = !!groups && groups.length > 0;

  return (
    <main
      className="min-h-[calc(100vh-60px)] px-5 sm:px-6 py-10 sm:py-12"
      style={{
        background: "var(--ft-surface)",
        color: "var(--ft-ink)",
      }}
    >
      <div className="max-w-[1100px] mx-auto">
        {brandKicker && (
          <div
            className="font-mono text-[11px] uppercase tracking-[0.2em] mb-2"
            style={{ color: "var(--ft-text-soft)" }}
          >
            {brandKicker}
          </div>
        )}
        <h1 className="font-sans text-[28px] sm:text-[32px] md:text-[36px] font-medium leading-tight mb-2">
          {title}
        </h1>
        {subtitle && (
          <p
            className="max-w-[720px] leading-relaxed mb-8 sm:mb-9 font-sans text-[14px] sm:text-[15px]"
            style={{ color: "var(--ft-text-muted)" }}
          >
            {subtitle}
          </p>
        )}
        {isGrouped ? (
          <div className="flex flex-col gap-8 sm:gap-10">
            {groups!.map((g) =>
              g.tiles.length === 0 ? null : (
                <section key={g.key}>
                  <div className="mb-3 sm:mb-4">
                    <div
                      className="font-mono text-[11px] uppercase tracking-[0.18em] mb-1"
                      style={{ color: "var(--ft-accent)" }}
                    >
                      {g.label}
                    </div>
                    {g.hint && (
                      <p
                        className="text-[13px] leading-snug font-sans max-w-[640px]"
                        style={{ color: "var(--ft-text-muted)" }}
                      >
                        {g.hint}
                      </p>
                    )}
                  </div>
                  <TileGrid
                    tiles={g.tiles}
                    orderKey={orderKey ? `${orderKey}:${g.key}` : undefined}
                  />
                </section>
              ),
            )}
            {draggable && (
              <p
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--ft-text-soft)" }}
              >
                Drag tiles within a section to rearrange · order saves per
                device
              </p>
            )}
          </div>
        ) : (
          <>
            <TileGrid tiles={tiles ?? []} orderKey={orderKey} />
            {draggable && (
              <p
                className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--ft-text-soft)" }}
              >
                Drag tiles to rearrange · order saves per device
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// Single draggable grid. Owns its own localStorage entry + drag state.
// Rendered once for flat mode + once per group for grouped mode.
function TileGrid({
  tiles,
  orderKey,
}: {
  tiles: Tile[];
  orderKey?: string;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [dropTargetHref, setDropTargetHref] = useState<string | null>(null);

  // Load saved order on mount / orderKey change.
  useEffect(() => {
    if (!orderKey) {
      setOrder(null);
      return;
    }
    try {
      const raw = localStorage.getItem(`tile-order:${orderKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.every((x) => typeof x === "string")
        ) {
          setOrder(parsed);
          return;
        }
      }
    } catch {
      /* localStorage unavailable; just render source order */
    }
    setOrder(null);
  }, [orderKey]);

  // Persist on changes.
  useEffect(() => {
    if (!orderKey || !order) return;
    try {
      localStorage.setItem(`tile-order:${orderKey}`, JSON.stringify(order));
    } catch {
      /* quota or private-mode; user keeps current-session order anyway */
    }
  }, [order, orderKey]);

  // Apply stored order, then append any new (un-stored) tiles at the
  // end. Drops stored hrefs that no longer exist.
  const displayTiles = (() => {
    if (!orderKey || !order) return tiles;
    const seen = new Set<string>();
    const out: Tile[] = [];
    for (const href of order) {
      const t = tiles.find((x) => x.href === href);
      if (t && !seen.has(href)) {
        out.push(t);
        seen.add(href);
      }
    }
    for (const t of tiles) {
      if (!seen.has(t.href)) out.push(t);
    }
    return out;
  })();

  const draggable = !!orderKey;

  const onDragStart = (href: string) => (e: React.DragEvent) => {
    setDraggingHref(href);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", href);
  };
  const onDragOver = (href: string) => (e: React.DragEvent) => {
    if (!draggingHref) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetHref !== href) setDropTargetHref(href);
  };
  const onDragLeave = () => {
    // Don't clear on every leave — the next dragover from the next
    // tile will set the new target. Only clear when we leave the grid
    // entirely (handled by dragend).
  };
  const onDragEnd = () => {
    setDraggingHref(null);
    setDropTargetHref(null);
  };
  const onDrop = (targetHref: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourceHref = e.dataTransfer.getData("text/plain") || draggingHref;
    setDraggingHref(null);
    setDropTargetHref(null);
    if (!sourceHref || sourceHref === targetHref) return;
    // Reject cross-grid drops: if the source isn't in this grid, do
    // nothing. Prevents a tile from one section landing in another.
    const inGrid = displayTiles.some((t) => t.href === sourceHref);
    if (!inGrid) return;
    const next = displayTiles.map((t) => t.href);
    const sIdx = next.indexOf(sourceHref);
    const tIdx = next.indexOf(targetHref);
    if (sIdx === -1 || tIdx === -1) return;
    next.splice(sIdx, 1);
    next.splice(tIdx, 0, sourceHref);
    setOrder(next);
  };

  return (
    <div className="grid gap-3 sm:gap-4 md:gap-5 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {displayTiles.map((t) => {
        const isDragging = draggingHref === t.href;
        const isDropTarget =
          dropTargetHref === t.href && draggingHref && draggingHref !== t.href;

        // Inline style fallback because the kit's accent color comes
        // from a CSS var (consumer-themable) — Tailwind's arbitrary
        // value classes can read var() but the dynamic border + ring
        // states layer cleaner here.
        const tileStyle: CSSProperties = {
          background: "var(--ft-card)",
          color: "var(--ft-ink)",
          borderColor: isDragging || isDropTarget
            ? "var(--ft-accent)"
            : "var(--ft-hair-strong)",
        };
        if (isDropTarget) {
          tileStyle.boxShadow =
            "var(--ft-shadow-card), 0 0 0 2px var(--ft-accent-ring)";
        }

        return (
          <Link
            key={t.href}
            href={t.href}
            draggable={draggable}
            onDragStart={draggable ? onDragStart(t.href) : undefined}
            onDragOver={draggable ? onDragOver(t.href) : undefined}
            onDragLeave={draggable ? onDragLeave : undefined}
            onDragEnd={draggable ? onDragEnd : undefined}
            onDrop={draggable ? onDrop(t.href) : undefined}
            onClick={(e) => {
              // If a drag just ended on this tile, swallow the
              // click — otherwise Safari fires both events.
              if (draggingHref) e.preventDefault();
            }}
            style={tileStyle}
            className={[
              "ft-tile-card flex flex-col justify-between aspect-square p-3 sm:p-5 md:p-6 border-2 rounded-[8px] no-underline transition-all hover:-translate-y-0.5 hover:shadow-[var(--ft-shadow-card)]",
              isDragging ? "opacity-40 cursor-grabbing" : "",
              draggable ? "cursor-grab" : "",
            ].join(" ")}
          >
            {/* Icon scales down at mobile via CSS scale — keeps
                iconElement self-contained while staying iPhone-
                proportioned in the smaller tile. */}
            <div
              className="origin-top-left scale-75 sm:scale-100"
              style={{ color: "var(--ft-accent)" }}
            >
              {t.iconElement}
            </div>
            <div className="min-w-0">
              <div
                className={`font-sans text-[15px] sm:text-[20px] md:text-[22px] font-medium leading-tight ${
                  t.hint || (t.stats && t.stats.length) ? "mb-1 sm:mb-1.5" : ""
                }`}
              >
                {t.label}
              </div>
              {/* Hint hidden at mobile — iPhone-style icon+label
                  only. Returns at sm+ where the tile has room. */}
              {t.hint && (
                <div
                  className="hidden sm:block text-[13px] leading-snug font-sans mb-2 line-clamp-3"
                  style={{ color: "var(--ft-text-muted)" }}
                >
                  {t.hint}
                </div>
              )}
              {/* Stats: compact at mobile (single row, smaller),
                  full at tablet+. */}
              {t.stats && t.stats.length > 0 && (
                <div
                  className="flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-0.5 sm:gap-y-1 font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.18em] mt-0.5 sm:mt-1"
                  style={{ color: "var(--ft-text-muted)" }}
                >
                  {t.stats.map((s, i) => (
                    <span key={i} className="whitespace-nowrap">
                      <span
                        className="font-sans text-[11px] sm:text-[13px] font-medium mr-1 sm:mr-1.5 tracking-normal normal-case"
                        style={{ color: "var(--ft-ink)" }}
                      >
                        {s.value}
                      </span>
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// Default export for the legacy specforge import pattern
// `import TileMenu from "@/components/TileMenu"`.
export default TileMenu;
