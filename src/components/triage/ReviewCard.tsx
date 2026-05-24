"use client";

import React from "react";

// Generic "review card" primitive — the 2-column layout used by every
// disposition surface: status + action buttons in a tight aside on the
// left, content + context in a wider article on the right. Article
// clips to the aside's measured height when compact; expands to natural
// height when the consumer flips `expanded`.
//
// Scope: JUST the layout chrome. The outer flex row, aside box, article
// box with its compact-mode clip + expand behavior. Everything inside
// is the caller's content.
//
// Theming (#935): all colors / borders / shadows reference `--ft-*`
// CSS variables. Defaults live in `../default-theme.css`. Border
// radii are kept hardcoded (10px) since they're structural and don't
// need per-consumer override.

export type ReviewCardDrag = {
  enabled?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: React.DragEventHandler<HTMLElement>;
  onDragEnd?: React.DragEventHandler<HTMLElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
};

export type ReviewCardProps = {
  asideRef?: React.Ref<HTMLElement>;
  articleRef?: React.Ref<HTMLElement>;
  expanded: boolean;
  asideHeight: number | null;
  aside: React.ReactNode;
  children: React.ReactNode;
  drag?: ReviewCardDrag;
  asideTitle?: string;
  className?: string;
};

const boxStyle: React.CSSProperties = {
  background: "var(--ft-card)",
  border: "1px solid var(--ft-hair-strong)",
  boxShadow: "var(--ft-shadow-soft)",
  borderRadius: 10,
};

export default function ReviewCard({
  asideRef,
  articleRef,
  expanded,
  asideHeight,
  aside,
  children,
  drag,
  asideTitle,
  className,
}: ReviewCardProps) {
  return (
    <div
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      className={"flex items-stretch gap-3" + (className ? " " + className : "")}
      style={{
        opacity: drag?.isDragging ? 0.4 : 1,
        boxShadow: drag?.isDragOver ? "inset 0 -3px 0 var(--ft-accent-bug)" : undefined,
        transition: "opacity 120ms ease-out, box-shadow 120ms ease-out",
      }}
    >
      <aside
        ref={asideRef}
        draggable={drag?.enabled}
        onDragStart={drag?.onDragStart}
        onDragEnd={drag?.onDragEnd}
        className="p-4 flex flex-col gap-2 flex-shrink-0 self-stretch"
        style={{
          ...boxStyle,
          width: 170,
          cursor: drag?.enabled ? "grab" : "default",
        }}
        title={asideTitle}
      >
        {aside}
      </aside>
      <article
        ref={articleRef}
        className="p-4 flex-1 min-w-0 flex flex-col [&>*]:flex-shrink-0"
        style={{
          ...boxStyle,
          maxHeight: !expanded && asideHeight != null ? asideHeight : undefined,
          overflow: !expanded ? "hidden" : "visible",
        }}
      >
        {children}
      </article>
    </div>
  );
}
