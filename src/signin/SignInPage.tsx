"use client";

// Magic-link sign-in page (intake #967 / META #930).
//
// Portable across projects: branding + endpoint URLs + colors come
// from props or CSS variables. The auth backend (Supabase OTP / NextAuth
// magic link / Clerk / etc.) lives in the consumer — this component just
// POSTs the email and handles the UX states.
//
// Required wiring on the consumer:
//   - `signinEndpoint` POST receives `{ email, next? }` and returns:
//       { ok: true, magicLinkSent: true, email: string }      // OTP sent
//       { ok: true, target: string }                           // dev / test path — cookies already set; client hard-navigates
//       { ok: false, error: string } / non-2xx                 // error
//   - (optional) `devSigninEndpoint` for the localhost-only quick-login
//
// Theming via `--ft-*` CSS variables (same convention as the rest of
// backlog-kit's components). Override `brandName` + `brandLinkHref`
// to swap the page header.

import { useEffect, useState, Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export type SignInPageProps = {
  /** Display name in the page header + form title. Default: "the app". */
  brandName?: string;
  /**
   * Optional sign-up link below the form. When set, renders
   * "New here? <a>Sign up</a>." beneath the email field.
   */
  signupHref?: string;
  /**
   * Brand link target for both the header logo and the "back to home"
   * affordance. Default: "/".
   */
  brandLinkHref?: string;
  /**
   * Endpoint that receives the email POST and returns either a
   * magic-link-sent state or a cookies-set redirect target.
   * Default: "/api/auth/signin".
   */
  signinEndpoint?: string;
  /**
   * Optional localhost-only quick-signin endpoint. When provided, a
   * "Sign in as admin (no email, instant)" button appears below the
   * form on localhost / .local hostnames. The endpoint is expected to
   * be 404 in production (specforge gates by NODE_ENV + origin).
   * The button POSTs `{ email }` and expects `{ ok: true, target }`.
   */
  devSigninEndpoint?: string;
  /**
   * Email used for the dev-signin button (typically the seeded admin
   * account). Default: "admin@localhost".
   */
  devSigninEmail?: string;
  /**
   * Optional custom error-code → friendly-message map for the
   * `?error=` query parameter. Defaults to a small built-in map.
   */
  errorMessages?: Record<string, string>;
};

function ErrorBanner({ errorMessages }: { errorMessages: Record<string, string> }) {
  const params = useSearchParams();
  const err = params.get("error");
  if (!err) return null;
  const message = errorMessages[err] ?? `Sign-in failed: ${decodeURIComponent(err)}`;
  return (
    <div
      role="alert"
      style={{
        marginTop: "1rem",
        padding: "0.6rem 0.85rem",
        background: "var(--ft-error-bg)",
        color: "var(--ft-error-fg)",
        fontSize: "0.85rem",
        borderRadius: 4,
      }}
    >
      {message}
    </div>
  );
}

function SignInForm({
  brandName,
  signupHref,
  signinEndpoint,
  devSigninEndpoint,
  devSigninEmail,
  errorMessages,
}: Required<Pick<SignInPageProps, "brandName" | "signinEndpoint" | "devSigninEmail" | "errorMessages">> & {
  signupHref: string | undefined;
  devSigninEndpoint: string | undefined;
}) {
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(signinEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next: next ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      if (data.magicLinkSent) {
        setMagicLinkSentTo(data.email ?? email.trim());
        setSubmitting(false);
        return;
      }
      window.location.href = data.target ?? "/admin";
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (magicLinkSentTo) {
    return (
      <>
        <h1 style={{ fontSize: "1.55rem", margin: "0 0 0.6rem", fontWeight: 600 }}>Check your email.</h1>
        <p style={{ color: "var(--ft-text-soft)", margin: "0 0 1rem", lineHeight: 1.55 }}>
          We sent a one-click sign-in link to{" "}
          <strong style={{ color: "var(--ft-ink)" }}>{magicLinkSentTo}</strong>. Click the link in that
          email to land back here, signed in.
        </p>
        <p style={{ color: "var(--ft-text-muted)", margin: "0 0 1.25rem", lineHeight: 1.55, fontSize: "0.88rem" }}>
          The link expires in about an hour. Didn&apos;t get it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => { setMagicLinkSentTo(null); setEmail(""); }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--ft-ink)",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            try again
          </button>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.4rem", fontWeight: 600 }}>
        Sign in to {brandName}
      </h1>
      <p style={{ color: "var(--ft-text-soft)", margin: "0 0 1.5rem", lineHeight: 1.55 }}>
        Type your email — we&apos;ll send a one-click sign-in link.
        {signupHref ? (
          <>
            {" "}New here?{" "}
            <Link href={signupHref} style={{ color: "var(--ft-ink)", textDecoration: "underline" }}>
              Sign up
            </Link>
            .
          </>
        ) : null}
      </p>

      <form onSubmit={submit}>
        <label
          htmlFor="signin-email"
          style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.35rem", fontWeight: 500 }}
        >
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={submitting}
          placeholder="you@company.com"
          style={{
            width: "100%",
            fontSize: "0.95rem",
            padding: "0.65rem 0.8rem",
            border: "1px solid var(--ft-input-border)",
            borderRadius: 6,
            boxSizing: "border-box",
            background: "var(--ft-input-bg)",
            color: "var(--ft-ink)",
            fontFamily: "inherit",
          }}
        />

        {error && (
          <div
            role="alert"
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 0.75rem",
              background: "var(--ft-error-bg)",
              color: "var(--ft-error-fg)",
              fontSize: "0.85rem",
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: "1rem",
            width: "100%",
            background: "var(--ft-bubble-bg)",
            color: "var(--ft-bubble-fg)",
            border: "1px solid var(--ft-bubble-bg)",
            padding: "0.7rem 1rem",
            borderRadius: 6,
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Sending sign-in link…" : "Send sign-in link"}
        </button>
      </form>

      {devSigninEndpoint && (
        <DevSigninButton
          submitting={submitting}
          setSubmitting={setSubmitting}
          setError={setError}
          endpoint={devSigninEndpoint}
          email={devSigninEmail}
        />
      )}

      <ErrorBanner errorMessages={errorMessages} />
    </>
  );
}

// Localhost-only quick-login button. Visible only when window.hostname
// is localhost / 127.0.0.1 / *.local. Consumer's devSigninEndpoint
// MUST gate by NODE_ENV + origin server-side — the client hide is
// just UX hygiene, not security.
function DevSigninButton({
  submitting,
  setSubmitting,
  setError,
  endpoint,
  email,
}: {
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  setError: (s: string | null) => void;
  endpoint: string;
  email: string;
}) {
  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    setIsLocal(host === "localhost" || host === "127.0.0.1" || host.endsWith(".local"));
  }, []);

  if (!isLocal) return null;

  const devSignin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Dev sign-in failed.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.target ?? "/admin";
    } catch {
      setError("Network error.");
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "0.75rem",
        background: "rgba(197, 66, 27, 0.06)",
        border: "1px dashed rgba(197, 66, 27, 0.4)",
        borderRadius: 6,
      }}
    >
      <p
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.72rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ft-accent-idea)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        }}
      >
        Dev mode · localhost only
      </p>
      <button
        type="button"
        onClick={devSignin}
        disabled={submitting}
        style={{
          width: "100%",
          background: "transparent",
          color: "var(--ft-ink)",
          border: "1px solid var(--ft-input-border)",
          padding: "0.55rem 1rem",
          borderRadius: 6,
          fontSize: "0.85rem",
          fontWeight: 500,
          cursor: submitting ? "default" : "pointer",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        Sign in as admin (no email, instant)
      </button>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: "var(--ft-text-muted)" }}>
        Production is unaffected. The dev-signin endpoint should 404 outside localhost / dev.
      </p>
    </div>
  );
}

export default function SignInPage(props: SignInPageProps = {}) {
  const brandName = props.brandName ?? "the app";
  const brandLinkHref = props.brandLinkHref ?? "/";
  const signinEndpoint = props.signinEndpoint ?? "/api/auth/signin";
  const devSigninEmail = props.devSigninEmail ?? "admin@localhost";
  const errorMessages = props.errorMessages ?? DEFAULT_ERROR_MESSAGES;
  return (
    <main
      style={{
        background: "var(--ft-surface)",
        color: "var(--ft-ink)",
        display: "flex",
        flexDirection: "column",
        padding: "1.25rem 1.5rem 2.5rem",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <header
        style={{
          maxWidth: 1100,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "2rem",
        }}
      >
        <Link
          href={brandLinkHref}
          aria-label={`${brandName} — back to home`}
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "1.6rem",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--ft-ink)",
            textDecoration: "none",
          }}
        >
          {brandName}
        </Link>
        <Link
          href={brandLinkHref}
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
            fontSize: "0.72rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ft-text-muted)",
            textDecoration: "none",
          }}
        >
          ← Back to home
        </Link>
      </header>
      <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5rem" }}>
        <div
          style={{
            background: "var(--ft-surface)",
            padding: "2.5rem 2rem",
            borderRadius: 10,
            boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
            maxWidth: 440,
            width: "100%",
          }}
        >
          <Suspense fallback={<p>Loading…</p>}>
            <SignInForm
              brandName={brandName}
              signupHref={props.signupHref}
              signinEndpoint={signinEndpoint}
              devSigninEndpoint={props.devSigninEndpoint}
              devSigninEmail={devSigninEmail}
              errorMessages={errorMessages}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

const DEFAULT_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "The sign-in link is invalid or incomplete.",
  not_allowlisted: "Your account isn't on the access list.",
};
