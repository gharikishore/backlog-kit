"use client";

// Top header for `/admin/*` pages (intake #968 / META #930).
//
// Portable across projects: brand text + endpoints come from props,
// colors from `--ft-*` CSS vars. Fetches a "/api/me" endpoint that the
// consumer wires to return `{ email, profile?: { publicHandle?,
// displayName? } }`. Sign-out POSTs to a "/api/logout" endpoint that
// the consumer wires.
//
// Renders nothing meaningful for unauthenticated state — the admin-
// route gate (consumer-supplied) should redirect before mounting this.

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, ShieldHalf, BookOpen } from "lucide-react";

export type AdminHeaderProps = {
  /** Display name in the brand link. Default: "App". */
  brandName?: string;
  /** Brand link target. Default: "/admin". */
  brandHref?: string;
  /** Subtitle next to the brand. Default: "Operate the platform". */
  subtitleText?: string;
  /** /me endpoint (returns user + profile). Default: "/api/me". */
  meEndpoint?: string;
  /** Sign-out POST endpoint. Default: "/api/logout". */
  logoutEndpoint?: string;
  /** Optional secondary link (e.g. handbook). Set to null to hide. */
  secondaryLink?: { href: string; label: string } | null;
  /** Where to land after sign-out. Default: "/". */
  signedOutHref?: string;
};

type MeResponse = {
  email?: string;
  profile?: {
    publicHandle?: string;
    displayName?: string;
  };
};

export function AdminHeader({
  brandName = "App",
  brandHref = "/admin",
  subtitleText = "Operate the platform",
  meEndpoint = "/api/me",
  logoutEndpoint = "/api/logout",
  secondaryLink = { href: "/handbook", label: "Handbook" },
  signedOutHref = "/",
}: AdminHeaderProps = {}) {
  const [email, setEmail] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(meEndpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: MeResponse) => {
        if (cancelled) return;
        if (typeof d.email === "string") setEmail(d.email);
        if (d.profile && typeof d.profile.publicHandle === "string") setHandle(d.profile.publicHandle);
        if (d.profile && typeof d.profile.displayName === "string") setDisplayName(d.profile.displayName);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meEndpoint]);

  const signOut = async () => {
    try { await fetch(logoutEndpoint, { method: "POST" }); } catch {}
    window.location.href = signedOutHref;
  };

  return (
    <header className="relative border-b font-sans" style={{ borderColor: "var(--ft-hair-strong)", background: "var(--ft-surface)", color: "var(--ft-ink)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link
            href={brandHref}
            className="text-[18px] sm:text-[22px] font-medium tracking-tight no-underline hover:opacity-70 transition-opacity flex-shrink-0"
            style={{ color: "var(--ft-ink)" }}
          >
            {brandName}
          </Link>
          <div className="flex items-center gap-2 pl-3 sm:pl-4 min-w-0 border-l" style={{ borderColor: "var(--ft-hair-strong)" }}>
            <ShieldHalf size={13} style={{ color: "var(--ft-accent-bug)" }} className="flex-shrink-0" />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] hidden md:inline" style={{ color: "var(--ft-text-soft)" }}>
              Admin
            </span>
            <Link
              href={brandHref}
              className="text-[14px] sm:text-[15px] font-medium no-underline hover:opacity-70 transition-opacity truncate"
              style={{ color: "var(--ft-ink)" }}
            >
              {subtitleText}
            </Link>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 font-mono text-[11px]">
          {secondaryLink && (
            <Link
              href={secondaryLink.href}
              className="flex items-center gap-1.5 uppercase tracking-[0.18em] no-underline transition-colors"
              style={{ color: "var(--ft-text-soft)" }}
            >
              <BookOpen size={11} />
              <span>{secondaryLink.label}</span>
            </Link>
          )}
          <div className="flex items-center gap-2 pl-6 border-l" style={{ borderColor: "var(--ft-hair-strong)" }}>
            <span className="uppercase tracking-[0.18em]" style={{ color: "var(--ft-text-soft)" }}>Signed in as</span>
            {displayName && <span style={{ color: "var(--ft-ink)" }}>{displayName}</span>}
            {displayName && (email || handle) && <span style={{ color: "var(--ft-text-soft)" }}>·</span>}
            {email && <span style={{ color: "var(--ft-text-muted)" }}>{email}</span>}
            {handle && (
              <>
                {email && <span style={{ color: "var(--ft-text-soft)" }}>·</span>}
                <span style={{ color: "var(--ft-text-muted)" }}>{handle}</span>
              </>
            )}
            {!displayName && !email && !handle && <span style={{ color: "var(--ft-ink)" }}>—</span>}
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 uppercase tracking-[0.18em] transition-colors"
            style={{ color: "var(--ft-text-soft)", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
          >
            <LogOut size={11} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
