import { sql } from "drizzle-orm";
import { intakeItems, bugReports, type NewBugReport, type NewIntakeItem } from "../schema";
import { insertAuditEntry } from "../lib/audit";
import {
  uploadScreenshotDataUrl,
  mergeScreenshotRefIntoContext,
  type R2Context,
} from "../lib/screenshot-r2";
import type { AuthAdapter } from "../lib/auth-adapter";

// POST /api/intake handler — submit a new intake item (bug, feedback,
// or idea). Auth-gated: any signed-in user. Admin gates only kick in
// for state changes (see admin-backlog-item handler).
//
// For bugs: also mirrors to bug_reports (preserves typed screenshot +
// viewport columns + the source_bug_report_id pointer).
//
// Seq-gap-reuse: intake_items.seq is human-friendly (#1, #2, …). The
// Postgres sequence advances on every started INSERT even when it
// rolls back, so 413 / FK / serialization failures leave gaps. User
// prefers contiguous seqs, so this handler scans for the lowest gap
// and uses it; race-safe via the unique index + retry path.

const ALLOWED_KINDS = new Set(["bug", "feedback", "idea"]);
const MAX_DESCRIPTION = 8_000;
const MAX_SCREENSHOT = 5 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export type IntakeHandlerDeps = {
  adapter: AuthAdapter;
  /**
   * Drizzle db handle with `insert` + `execute`. Narrowly typed so the
   * package doesn't pin to a specific drizzle-orm version.
   */
  db: {
    insert: (table: any) => {
      values: (v: any) => {
        returning: (fields: any) => Promise<any[]>;
      };
    };
    execute: <T = any>(query: any) => Promise<T[]> | Promise<any>;
  };
  r2: R2Context;
  /**
   * Default category to stamp on new intakes. Specforge uses "Design"
   * (most user-filed intakes are feature/UI ideas). Override per
   * consumer.
   */
  defaultCategory?: string;
};

type DecisionOption = { value: string; label: string; detail?: string };

export async function handleIntakePost(
  req: Request,
  deps: IntakeHandlerDeps,
): Promise<Response> {
  const user = await deps.adapter.readSessionUser(req);
  if (!user) {
    return json({ error: "Sign in required." }, 401);
  }

  let body: {
    kind?: string;
    description?: string;
    title?: string;
    pageUrl?: string;
    context?: Record<string, unknown>;
    decisionOptions?: DecisionOption[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const kind = (body.kind ?? "").trim();
  if (!ALLOWED_KINDS.has(kind)) {
    return json({ error: `kind must be one of: bug, feedback, idea` }, 400);
  }

  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, MAX_DESCRIPTION)
      : "";
  if (!description) {
    return json({ error: "description is required" }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : null;
  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 2000) : null;
  const rawContext = (body.context && typeof body.context === "object"
    ? body.context
    : null) as Record<string, unknown> | null;

  // Upload screenshot to R2 if present + replace data URL with R2 ref.
  let context = rawContext;
  if (rawContext) {
    const rawScreenshot =
      typeof rawContext.screenshotDataUrl === "string" &&
      rawContext.screenshotDataUrl.length <= MAX_SCREENSHOT
        ? (rawContext.screenshotDataUrl as string)
        : null;
    if (rawScreenshot) {
      const ref = await uploadScreenshotDataUrl(rawScreenshot, deps.r2);
      if (ref) {
        context = mergeScreenshotRefIntoContext(rawContext, ref);
      }
    }
  }

  // For bugs, mirror into bug_reports.
  let sourceBugReportId: string | null = null;
  if (kind === "bug" && context) {
    const viewport = (context.viewport as { w?: number; h?: number } | undefined) ?? {};
    const bugValues: NewBugReport = {
      reporterUserId: user.id,
      description,
      pageUrl: pageUrl ?? "(unknown)",
      viewportW: typeof viewport.w === "number" ? viewport.w : null,
      viewportH: typeof viewport.h === "number" ? viewport.h : null,
      userAgent:
        typeof context.userAgent === "string"
          ? (context.userAgent as string).slice(0, 1000)
          : null,
      screenshotDataUrl: null,
      context: context as Record<string, unknown>,
    };
    const [br] = await deps.db.insert(bugReports).values(bugValues).returning({ id: bugReports.id });
    sourceBugReportId = br.id;
  }

  // Sanitize decisionOptions.
  let decisionOptions: DecisionOption[] | null = null;
  if (Array.isArray(body.decisionOptions) && body.decisionOptions.length > 0) {
    const cleaned = body.decisionOptions
      .filter((o) => o && typeof o.value === "string" && typeof o.label === "string")
      .slice(0, 6)
      .map((o) => ({
        value: o.value.slice(0, 80),
        label: o.label.slice(0, 200),
        ...(o.detail && typeof o.detail === "string"
          ? { detail: o.detail.slice(0, 500) }
          : {}),
      }));
    if (cleaned.length > 0) decisionOptions = cleaned;
  }

  const baseValues: NewIntakeItem = {
    kind,
    sourceBugReportId,
    title,
    description,
    pageUrl,
    context: context ?? null,
    reporterUserId: user.id,
    state: "pending",
    category: deps.defaultCategory ?? null,
    decisionOptions,
  };

  // Find lowest seq gap (including tail gaps past max(seq) up to
  // last_value, so deleting the top row leaves a reusable hole).
  const gapRows: any = await deps.db.execute(sql`
    SELECT g.seq::int AS seq
    FROM generate_series(
      1,
      GREATEST(
        COALESCE((SELECT max(seq) FROM intake_items), 0),
        COALESCE((SELECT last_value::int FROM intake_items_seq_seq), 0)
      )
    ) g(seq)
    WHERE NOT EXISTS (SELECT 1 FROM intake_items WHERE seq = g.seq)
    ORDER BY g.seq
    LIMIT 1
  `);
  const gapList = Array.isArray(gapRows) ? gapRows : (gapRows as any)[0];
  const gapSeq = gapList?.[0]?.seq;

  // Consumer #1036 (2026-05-26): both insert paths need sequence-drift
  // recovery. Background: scripts that file intakes with explicit `seq`
  // values can leave intake_items_seq_seq behind max(seq). When the
  // default-nextval path then runs (gapless main flow OR gap-race
  // retry), it gets a value that's already taken → 23505. Before this
  // fix the retry just re-tried with the same broken sequence and the
  // user's bug submission failed (specforge prod outage on 2026-05-25).
  //
  // insertWithSeqRecovery handles a single 23505: advances the sequence
  // to max(seq)+1, retries once. A second 23505 propagates (genuine
  // duplicate, not drift).
  async function insertWithSeqRecovery(
    values: NewIntakeItem,
  ): Promise<{ id: string; seq: number }> {
    try {
      const [r] = await deps.db
        .insert(intakeItems)
        .values(values)
        .returning({ id: intakeItems.id, seq: intakeItems.seq });
      return r;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== "23505") throw err;
      await deps.db.execute(sql`
        SELECT setval(
          'intake_items_seq_seq',
          (SELECT COALESCE(MAX(seq), 0) + 1 FROM intake_items),
          false
        )
      `);
      const [r] = await deps.db
        .insert(intakeItems)
        .values(values)
        .returning({ id: intakeItems.id, seq: intakeItems.seq });
      return r;
    }
  }

  let item: { id: string; seq: number };
  if (gapSeq != null) {
    try {
      const [inserted] = await deps.db
        .insert(intakeItems)
        .values({ ...baseValues, seq: gapSeq })
        .returning({ id: intakeItems.id, seq: intakeItems.seq });
      item = inserted;
    } catch (err) {
      // Race: another submit took the same gap. Retry with default
      // nextval — routed through insertWithSeqRecovery so a drifted
      // sequence doesn't break the retry too.
      const code = (err as { code?: string } | null)?.code;
      if (code !== "23505") throw err;
      item = await insertWithSeqRecovery(baseValues);
    }
  } else {
    item = await insertWithSeqRecovery(baseValues);
  }

  await insertAuditEntry(
    {
      actorUserId: user.id,
      action: `intake.${kind}.submitted`,
      targetTable: "intake_items",
      targetId: item.id,
      metadata: { kind, pageUrl, hasScreenshot: !!sourceBugReportId },
    },
    {
      db: deps.db as unknown as Parameters<typeof insertAuditEntry>[1]["db"],
      getImpersonatorId: deps.adapter.getImpersonatorId,
    },
  );

  return json({ ok: true, id: item.id, seq: item.seq, kind });
}
