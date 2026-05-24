"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, MessageSquare, Lightbulb, Check } from "lucide-react";

// Floating bottom-right widget that lets a user file a bug / feedback /
// idea. Submits to the consumer-supplied `intakeEndpoint` (default
// `/api/intake`). Captures viewport / userAgent / recent console errors
// from ErrorReporter automatically; optionally captures a JPEG screenshot.
//
// Shared-package note: every `window.dispatchEvent` channel name + every
// global symbol is prefixed `feedbackTriage` so it can never collide
// with consumer-owned events. Consumers wanting to open the widget from
// outside dispatch `feedback-triage:open` with `{ kind }`. The widget
// also broadcasts `feedback-triage:opened` / `feedback-triage:closed`
// so other components (e.g. SSE consumers) can pause work while a
// report is in flight.
//
// Theming (intake #935): every color comes from a `--ft-*` CSS
// variable. Defaults live in `../default-theme.css`. Consumers either
// import that file or define the variables themselves to fully recolor
// the widget without touching this code.

type Kind = "bug" | "feedback" | "idea";
type Phase = "idle" | "open" | "capturing" | "submitting" | "success" | "error";

const KIND_LABEL: Record<Kind, { label: string; pitch: string; icon: typeof Bug; accentVar: string }> = {
  bug: {
    label: "Report a bug",
    pitch: "Something broke or didn't behave. We'll capture the screen + recent errors.",
    icon: Bug,
    accentVar: "var(--ft-accent-bug)",
  },
  feedback: {
    label: "Send feedback",
    pitch: "A screen confused you, a flow felt awkward, a wording could be better.",
    icon: MessageSquare,
    accentVar: "var(--ft-accent-feedback)",
  },
  idea: {
    label: "Add idea",
    pitch: "A feature, a refactor, a corpus expansion. Lands in the same triage queue.",
    icon: Lightbulb,
    accentVar: "var(--ft-accent-idea)",
  },
};

export type IntakeWidgetProps = {
  /** Endpoint to POST captured intakes to. Default `/api/intake`. */
  intakeEndpoint?: string;
  /**
   * Pathname prefixes where the floating button should NOT render
   * (e.g. routes with their own intake widget). Pathname matching uses
   * `startsWith` on Next.js's `usePathname()` value.
   */
  hideOnPaths?: string[];
};

export default function IntakeWidget({
  intakeEndpoint = "/api/intake",
  hideOnPaths = [],
}: IntakeWidgetProps = {}) {
  const pathname = usePathname();
  if (pathname && hideOnPaths.some((p) => pathname.startsWith(p))) return null;
  return <IntakeWidgetInner intakeEndpoint={intakeEndpoint} />;
}

function IntakeWidgetInner({ intakeEndpoint }: { intakeEndpoint: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [kind, setKind] = useState<Kind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedSeq, setSubmittedSeq] = useState<number | null>(null);
  const [footerLift, setFooterLift] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function update() {
      const footer = document.querySelector("footer");
      if (!footer) {
        if (footerLift !== 0) setFooterLift(0);
        return;
      }
      const rect = footer.getBoundingClientRect();
      const overlapFromBottom = window.innerHeight - rect.top;
      const next = overlapFromBottom > 0 ? Math.round(overlapFromBottom + 12) : 0;
      setFooterLift((cur) => (cur === next ? cur : next));
    }
    update();
    let raf = 0;
    function onScrollOrResize() {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    }
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [footerLift]);

  useEffect(() => {
    if (phase === "open" || phase === "capturing" || phase === "submitting") {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [phase]);

  useEffect(() => {
    function onExternalOpen(e: Event) {
      const detail = (e as CustomEvent<{ kind?: Kind }>).detail;
      openModal(detail?.kind ?? "bug");
    }
    window.addEventListener("feedback-triage:open", onExternalOpen);
    return () => window.removeEventListener("feedback-triage:open", onExternalOpen);
  }, []);

  const [rightDrawerCount, setRightDrawerCount] = useState(0);
  useEffect(() => {
    const onOpen = () => setRightDrawerCount((c) => c + 1);
    const onClose = () => setRightDrawerCount((c) => Math.max(0, c - 1));
    window.addEventListener("right-drawer:open", onOpen);
    window.addEventListener("right-drawer:close", onClose);
    return () => {
      window.removeEventListener("right-drawer:open", onOpen);
      window.removeEventListener("right-drawer:close", onClose);
    };
  }, []);
  const bubbleHidden = rightDrawerCount > 0;

  useEffect(() => {
    if (phase !== "open") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, title, description]);

  useEffect(() => {
    const isOpen = phase !== "idle";
    window.dispatchEvent(new CustomEvent(isOpen ? "feedback-triage:opened" : "feedback-triage:closed"));
  }, [phase]);

  function openModal(initialKind: Kind = "bug") {
    setKind(initialKind);
    setTitle("");
    setDescription("");
    setErrorMsg(null);
    setIncludeScreenshot(initialKind === "bug");
    setPhase("open");
  }

  function closeModal() {
    if (phase === "submitting" || phase === "capturing") return;
    setPhase("idle");
  }

  function tryClose() {
    if (phase === "submitting" || phase === "capturing") return;
    const hasContent = title.trim().length > 0 || description.trim().length > 10;
    if (hasContent) {
      const ok = window.confirm("Discard this note?");
      if (!ok) return;
    }
    setPhase("idle");
  }

  async function captureScreenshot(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    try {
      if (dialogRef.current) dialogRef.current.style.visibility = "hidden";
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        logging: false,
        windowHeight: Math.min(window.innerHeight * 2, 3000),
        scale: 1,
      });
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const MAX_LOCAL_BYTES = 3.5 * 1024 * 1024;
      if (dataUrl.length > MAX_LOCAL_BYTES) {
        console.warn("[IntakeWidget] screenshot oversize after JPEG q=0.7:", dataUrl.length, "bytes");
        return null;
      }
      return dataUrl;
    } catch (err) {
      console.warn("[IntakeWidget] screenshot failed", err);
      return null;
    } finally {
      if (dialogRef.current) dialogRef.current.style.visibility = "visible";
    }
  }

  async function submit() {
    if (!description.trim()) {
      setErrorMsg("Please describe what you ran into.");
      return;
    }
    setErrorMsg(null);

    let screenshot: string | null = null;
    if (includeScreenshot) {
      setPhase("capturing");
      screenshot = await captureScreenshot();
    }

    setPhase("submitting");
    try {
      const recentErrors = (window as Window).__backlogKitRecentErrors ?? [];
      const context: Record<string, unknown> = {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        userAgent: navigator.userAgent,
        recentErrors: recentErrors.slice(-10),
        referrer: document.referrer || null,
      };
      if (screenshot) context.screenshotDataUrl = screenshot;

      const res = await fetch(intakeEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim() || null,
          description: description.trim(),
          pageUrl: window.location.href,
          context,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? `submit failed (${res.status})`);
      setSubmittedSeq(typeof data.seq === "number" ? data.seq : null);
      setPhase("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Submit failed");
      setPhase("open");
    }
  }

  const meta = KIND_LABEL[kind];

  return (
    <>
      <button
        type="button"
        onClick={() => openModal("bug")}
        aria-label="Report a bug or send feedback"
        aria-hidden={bubbleHidden}
        tabIndex={bubbleHidden ? -1 : 0}
        className="fixed right-4 sm:right-5 z-[9998] flex items-center gap-2 rounded-full cursor-pointer opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 transition-[opacity,bottom,transform] duration-200 p-2.5 sm:py-2 sm:px-3.5 sm:text-[12px] sm:font-mono sm:uppercase sm:tracking-[0.05em]"
        style={{
          background: "var(--ft-bubble-bg)",
          color: "var(--ft-bubble-fg)",
          border: "1px solid var(--ft-bubble-border)",
          boxShadow: "var(--ft-shadow-bubble)",
          // @ts-expect-error — CSS custom property for focus-visible ring color
          "--tw-ring-color": "var(--ft-bubble-ring)",
          bottom: footerLift > 0 ? `${footerLift}px` : "1rem",
          opacity: bubbleHidden ? 0 : undefined,
          transform: bubbleHidden ? "translateX(120%)" : undefined,
          pointerEvents: bubbleHidden ? "none" : undefined,
        }}
      >
        <Bug size={16} aria-hidden />
        <span className="hidden sm:inline">Bug · feedback</span>
      </button>

      {phase !== "idle" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="intake-title"
          ref={dialogRef}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "var(--ft-overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) tryClose();
          }}
        >
          <div
            style={{
              background: "var(--ft-surface)",
              color: "var(--ft-ink)",
              maxWidth: 560,
              width: "100%",
              borderRadius: 10,
              boxShadow: "var(--ft-shadow-modal)",
              padding: "1.5rem 1.5rem 1.25rem",
              fontFamily:
                "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            {phase === "success" ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--ft-success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={16} style={{ color: "var(--ft-success-on)" }} />
                  </div>
                  <h2 id="intake-title" style={{ fontSize: "1.25rem", margin: 0, fontWeight: 600 }}>
                    Captured{submittedSeq != null ? ` as #${submittedSeq}` : ""}.
                  </h2>
                </div>
                <p style={{ margin: "0 0 1.25rem", color: "var(--ft-text-muted)", lineHeight: 1.5 }}>
                  Sitting in the triage queue.
                  {submittedSeq != null && (
                    <>
                      {" "}Reference <strong>#{submittedSeq}</strong> in any follow-up.
                    </>
                  )}
                </p>
                <button type="button" onClick={() => { setSubmittedSeq(null); setPhase("idle"); }} style={primaryBtn(meta.accentVar)}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 id="intake-title" style={{ fontSize: "1.2rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
                  Talk back
                </h2>
                <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
                  {(["bug", "feedback", "idea"] as Kind[]).map((k) => {
                    const m = KIND_LABEL[k];
                    const Icon = m.icon;
                    const active = k === kind;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          padding: "0.4rem 0.75rem",
                          border: `1px solid ${active ? m.accentVar : "var(--ft-hair-strong)"}`,
                          background: active ? m.accentVar : "transparent",
                          color: active ? "var(--ft-surface)" : "var(--ft-ink)",
                          borderRadius: 999,
                          fontSize: "0.78rem",
                          cursor: "pointer",
                        }}
                      >
                        <Icon size={12} /> {m.label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "var(--ft-text-soft)" }}>{meta.pitch}</p>

                {kind !== "bug" && (
                  <>
                    <label htmlFor="intake-title-input" style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.35rem", fontWeight: 500 }}>
                      Title (optional)
                    </label>
                    <input
                      id="intake-title-input"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={kind === "idea" ? "Backlog UI · drag-to-reorder priority" : "Short label"}
                      disabled={phase === "submitting" || phase === "capturing"}
                      style={{
                        width: "100%",
                        fontSize: "0.9rem",
                        fontFamily: "inherit",
                        padding: "0.55rem 0.75rem",
                        border: "1px solid var(--ft-input-border)",
                        borderRadius: 6,
                        boxSizing: "border-box",
                        background: "var(--ft-input-bg)",
                        marginBottom: "0.8rem",
                      }}
                    />
                  </>
                )}

                <label htmlFor="intake-description" style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.35rem", fontWeight: 500 }}>
                  {kind === "bug" ? "What went wrong?" : kind === "feedback" ? "What was confusing or off?" : "Describe the idea"}
                </label>
                <textarea
                  id="intake-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    kind === "bug"
                      ? "Describe what you expected vs what happened…"
                      : kind === "feedback"
                        ? "The flow / screen / wording where you got stuck."
                        : "What's the problem this solves? Any rough sketch of the shape."
                  }
                  rows={5}
                  disabled={phase === "submitting" || phase === "capturing"}
                  style={{
                    width: "100%",
                    fontSize: "0.9rem",
                    fontFamily: "inherit",
                    padding: "0.6rem 0.75rem",
                    border: "1px solid var(--ft-input-border)",
                    borderRadius: 6,
                    resize: "vertical",
                    boxSizing: "border-box",
                    background: "var(--ft-input-bg)",
                    color: "var(--ft-ink)",
                  }}
                />

                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.75rem 0 0", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={includeScreenshot}
                    onChange={(e) => setIncludeScreenshot(e.target.checked)}
                    disabled={phase === "submitting" || phase === "capturing"}
                  />
                  Include a screenshot of this page
                </label>

                {errorMsg && (
                  <div role="alert" style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--ft-error-bg)", color: "var(--ft-error-fg)", fontSize: "0.85rem", borderRadius: 4 }}>
                    {errorMsg}
                  </div>
                )}

                <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                  <button type="button" onClick={closeModal} disabled={phase === "submitting" || phase === "capturing"} style={secondaryBtn}>
                    Cancel
                  </button>
                  <button type="button" onClick={submit} disabled={phase === "submitting" || phase === "capturing"} style={primaryBtn(meta.accentVar)}>
                    {phase === "capturing" ? "Capturing screenshot…" : phase === "submitting" ? "Sending…" : `Send ${kind}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function primaryBtn(accentVar: string): React.CSSProperties {
  return {
    background: accentVar,
    color: "var(--ft-bubble-fg)",
    border: `1px solid ${accentVar}`,
    padding: "0.55rem 1.1rem",
    borderRadius: 6,
    fontSize: "0.85rem",
    fontFamily: "inherit",
    fontWeight: 600,
    cursor: "pointer",
  };
}

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ft-ink)",
  border: "1px solid var(--ft-hair-strong)",
  padding: "0.55rem 1.1rem",
  borderRadius: 6,
  fontSize: "0.85rem",
  fontFamily: "inherit",
  cursor: "pointer",
};
