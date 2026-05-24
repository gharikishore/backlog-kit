"use client";

// BacklogUIAdapter — React-context contract that consumers fill with
// their own UI kit primitives + identity / reasoning helpers. The
// triage components (BacklogCard, CommentsThread, etc.) read from
// this context instead of importing kit primitives directly, so they
// stay portable across projects with different design systems.
//
// Specforge supplies Vellum's Button / Lozenge / cn + its
// handleOrRole / ReasoningSections helpers. Future consumers wire
// minimal stubs (an HTML <button>, span, identity passthrough) and
// upgrade as their design system matures.

import * as React from "react";
import { createContext, useContext, type ComponentType, type ReactNode, type CSSProperties } from "react";

// ── Visual primitives the kit supplies ──────────────────────────

export type KitButtonProps = {
  kind?: "primary" | "secondary" | "subtle" | "ghost" | "danger";
  tone?: "default" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md" | "lg";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  style?: CSSProperties;
  title?: string;
  children?: ReactNode;
  "aria-label"?: string;
};

export type KitLozengeProps = {
  tone?: "default" | "success" | "warning" | "danger" | "info" | "muted";
  size?: "sm" | "md";
  /** Optional leading icon — pass a lucide icon element. Vellum's <Lozenge> supports this slot natively. */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
};

// ── Identity helper ─────────────────────────────────────────────

export type IdentityCandidate = {
  id?: string | null;
  publicHandle?: string | null;
  domainRole?: string | null;
  systemRole?: string | null;
  email?: string | null;
  displayName?: string | null;
};

// ── Reasoning renderer (3-section convention) ──────────────────

export type ReasoningSectionsProps = { text: string | null; className?: string };

// ── The full adapter ───────────────────────────────────────────

export type BacklogUIAdapter = {
  /** Consumer's button primitive. Specforge passes its Vellum <Button>. */
  Button: ComponentType<KitButtonProps>;
  /** Consumer's lozenge / pill primitive. */
  Lozenge: ComponentType<KitLozengeProps>;
  /** Tailwind classname combiner (clsx / tailwind-merge / Vellum's cn). */
  cn: (...args: unknown[]) => string;
  /**
   * Compose a display label for a user — the package's components
   * never know whether to show handle / role / email; consumer's
   * helper decides. Specforge uses handleOrRole(handle, domainRole,
   * systemRole) — never name / email.
   */
  labelForUser: (u: IdentityCandidate | null | undefined) => string;
  /**
   * Render the triage_reasoning text. Specforge ships a 3-section
   * `## Suggestions / ## Follow-ups / ## Final decision` renderer
   * (intake #86). Bare projects can pass a `({text}) => <pre>{text}</pre>`
   * stub.
   */
  ReasoningSections: ComponentType<ReasoningSectionsProps>;
  /**
   * Inject the 3-section heading skeleton when the field is empty
   * (intake #87 — "Use template" button). Consumers without the
   * convention can return the input unchanged.
   */
  ensureTemplateSections: (text: string) => string;
};

const BacklogUIContext = createContext<BacklogUIAdapter | null>(null);

export type BacklogUIProviderProps = {
  value: BacklogUIAdapter;
  children: ReactNode;
};

export function BacklogUIProvider({ value, children }: BacklogUIProviderProps) {
  return <BacklogUIContext.Provider value={value}>{children}</BacklogUIContext.Provider>;
}

export function useBacklogUI(): BacklogUIAdapter {
  const ctx = useContext(BacklogUIContext);
  if (!ctx) {
    throw new Error(
      "useBacklogUI: missing <BacklogUIProvider>. Wrap the admin/backlog tree with a provider that supplies the kit primitives + identity / reasoning helpers.",
    );
  }
  return ctx;
}
