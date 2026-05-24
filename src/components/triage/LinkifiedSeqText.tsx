"use client";

import Link from "next/link";

// Renders an intake description (or any free-form text) and turns any
// "#NNN" seq reference into a link to /admin/backlog?q=%23NNN. Also
// strips the HTML-comment markers that scripts/lib/file-intake.mjs's
// syncMetaChildren() uses to delimit its auto-managed children block —
// the markers should never visibly leak into the rendered description.
//
// Lives next to BacklogCard because the description renderer is its
// only caller today. If other surfaces (TriagePanel candidate row,
// /admin/sessions detail) ever need it, hoist into src/lib.
export function LinkifiedSeqText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  // Hide the auto-managed-block delimiters from the rendered output.
  const cleaned = text
    .replace(/<!--\s*children:auto-start\s*-->\s*/g, "")
    .replace(/\s*<!--\s*children:auto-end\s*-->/g, "");
  // Split on #NNN-style references. The capture group keeps the
  // matched seqs in the output so we can re-render them as links.
  const parts = cleaned.split(/(#\d{2,5})/g);
  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (/^#\d{2,5}$/.test(part)) {
          return (
            <Link
              key={i}
              href={`/admin/backlog?q=${encodeURIComponent(part)}`}
              className="text-orange underline-offset-2 hover:underline"
            >
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
