import { bugReports, type NewBugReport } from "../schema";
import { insertAuditEntry } from "../lib/audit";
import {
  uploadScreenshotDataUrl,
  mergeScreenshotRefIntoContext,
  type R2Context,
} from "../lib/screenshot-r2";
import type { AuthAdapter } from "../lib/auth-adapter";

// POST /api/bugs handler — framework-agnostic. Takes a Request, returns
// a Response. Consumer wraps with its own `route.ts` (Next.js) or
// equivalent for other frameworks.
//
// Body shape (JSON):
//   {
//     description: string,            // required, ≤ 8000 chars
//     pageUrl: string,                // required, ≤ 2000 chars
//     viewportW?: number,
//     viewportH?: number,
//     userAgent?: string,             // ≤ 1000 chars
//     screenshotDataUrl?: string,     // base64 data URL, ≤ 5MB raw — uploaded to R2
//     context?: Record<string, unknown>,
//   }
//
// Behavior:
//   - Validates required fields, 400 on missing/invalid
//   - If screenshotDataUrl present, uploads to R2 and replaces with R2 ref in context
//   - Resolves session user via adapter (may be null — anonymous bugs OK)
//   - Inserts bug_reports row
//   - Logs `bug_report.submitted` to audit_log (with impersonation auto-stamp)
//   - Returns { ok: true, id }

const MAX_DESCRIPTION = 8_000;
const MAX_SCREENSHOT = 5 * 1024 * 1024;
const MAX_URL = 2_000;
const MAX_USER_AGENT = 1_000;

function clamp(s: unknown, max: number): string | null {
  if (s == null) return null;
  const str = typeof s === "string" ? s : String(s);
  return str.length > max ? str.slice(0, max) : str;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export type BugsHandlerDeps = {
  /** Auth adapter — supplies session user + impersonation context. */
  adapter: AuthAdapter;
  /**
   * Drizzle db handle (or open transaction). Narrowly typed so this
   * package doesn't pin to a specific drizzle-orm version.
   */
  db: {
    insert: (table: typeof bugReports) => {
      values: (v: NewBugReport) => {
        returning: (fields: { id: typeof bugReports.id }) => Promise<{ id: string }[]>;
      };
    };
  };
  /** R2 client + bucket for screenshot uploads. */
  r2: R2Context;
};

export async function handleBugPost(
  req: Request,
  deps: BugsHandlerDeps,
): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const description = clamp(body.description, MAX_DESCRIPTION)?.trim();
  if (!description) {
    return json({ ok: false, error: "description required" }, 400);
  }

  const pageUrl = clamp(body.pageUrl, MAX_URL);
  if (!pageUrl) {
    return json({ ok: false, error: "pageUrl required" }, 400);
  }

  const rawScreenshot =
    typeof body.screenshotDataUrl === "string" && body.screenshotDataUrl.length <= MAX_SCREENSHOT
      ? body.screenshotDataUrl
      : null;

  const screenshotRef = rawScreenshot
    ? await uploadScreenshotDataUrl(rawScreenshot, deps.r2)
    : null;

  const baseContext =
    typeof body.context === "object" && body.context !== null
      ? (body.context as Record<string, unknown>)
      : null;
  const context = screenshotRef
    ? mergeScreenshotRefIntoContext(baseContext, screenshotRef)
    : baseContext;

  const user = await deps.adapter.readSessionUser(req).catch(() => null);

  const inserted = await deps.db
    .insert(bugReports)
    .values({
      reporterUserId: user?.id ?? null,
      description,
      pageUrl,
      viewportW: typeof body.viewportW === "number" ? body.viewportW : null,
      viewportH: typeof body.viewportH === "number" ? body.viewportH : null,
      userAgent: clamp(body.userAgent, MAX_USER_AGENT),
      screenshotDataUrl: null, // intake #845 — base64 column deprecated
      context,
    })
    .returning({ id: bugReports.id });

  await insertAuditEntry(
    {
      actorUserId: user?.id ?? null,
      action: "bug_report.submitted",
      targetTable: "bug_reports",
      targetId: inserted[0].id,
      metadata: {
        pageUrl,
        hasScreenshot: !!screenshotRef,
        screenshotDeduped: screenshotRef?.alreadyExisted ?? false,
      },
    },
    {
      db: deps.db as unknown as Parameters<typeof insertAuditEntry>[1]["db"],
      getImpersonatorId: deps.adapter.getImpersonatorId,
    },
  );

  return json({ ok: true, id: inserted[0].id });
}
