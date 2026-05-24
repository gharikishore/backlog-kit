"use client";

import { useEffect } from "react";

// Mounted once in the root layout. Wires:
//   1. window.error               — synchronous uncaught exceptions
//   2. window.unhandledrejection  — async/promise rejections
//   3. console.error monkey-patch — captures last 20 entries into a ring
//      buffer that IntakeWidget attaches to user-submitted reports as
//      `recent_errors`.
//
// Reports POST to the consumer-supplied `endpoint` (default
// `/api/errors`) with sendBeacon when available (survives page-unload);
// falls back to fetch(keepalive: true).
//
// Shared-package note: globals are namespaced `__feedbackTriage*` so
// they never collide with consumer-owned globals.

const MAX_BUFFERED = 20;
const RING_BUFFER: Array<{ at: string; level: "error" | "warn"; message: string }> = [];

declare global {
  interface Window {
    __backlogKitRecentErrors?: typeof RING_BUFFER;
    __backlogKitReportClientError?: (e: { name?: string; message: string; stack?: string }) => void;
  }
}

function postError(
  endpoint: string,
  payload: {
    name?: string | null;
    message: string;
    stack?: string | null;
    pageUrl: string;
    context?: Record<string, unknown>;
  },
): void {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(endpoint, blob);
      if (ok) return;
    }
  } catch {
    // sendBeacon throws on some CSP setups; fall through to fetch
  }
  fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // swallow — logging the logger isn't useful
  });
}

export type ErrorReporterProps = {
  /** Endpoint to POST errors to. Default `/api/errors`. */
  endpoint?: string;
};

export default function ErrorReporter({ endpoint = "/api/errors" }: ErrorReporterProps = {}) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.__backlogKitRecentErrors = RING_BUFFER;

    const onError = (event: ErrorEvent) => {
      const err = event.error as { name?: string; stack?: string } | null;
      postError(endpoint, {
        name: err?.name ?? "Error",
        message: event.message ?? "Unknown error",
        stack: err?.stack ?? null,
        pageUrl: window.location.href,
        context: {
          source: "window.error",
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          userAgent: navigator.userAgent,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string; stack?: string } | string | null;
      const message =
        typeof reason === "string" ? reason : reason?.message ?? "Unhandled promise rejection";
      const name = typeof reason === "string" ? "UnhandledRejection" : reason?.name ?? "UnhandledRejection";
      const stack = typeof reason === "string" ? null : reason?.stack ?? null;
      postError(endpoint, {
        name,
        message,
        stack,
        pageUrl: window.location.href,
        context: { source: "unhandledrejection", userAgent: navigator.userAgent },
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      RING_BUFFER.push({
        at: new Date().toISOString(),
        level: "error",
        message: args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" "),
      });
      if (RING_BUFFER.length > MAX_BUFFERED) RING_BUFFER.shift();
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      RING_BUFFER.push({
        at: new Date().toISOString(),
        level: "warn",
        message: args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" "),
      });
      if (RING_BUFFER.length > MAX_BUFFERED) RING_BUFFER.shift();
      origWarn(...args);
    };

    window.__backlogKitReportClientError = (e) => {
      postError(endpoint, {
        name: e.name ?? "Error",
        message: e.message,
        stack: e.stack ?? null,
        pageUrl: window.location.href,
        context: { source: "manual", userAgent: navigator.userAgent },
      });
    };

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = origError;
      console.warn = origWarn;
    };
  }, [endpoint]);

  return null;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
