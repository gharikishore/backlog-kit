import {
  desc,
  asc,
  eq,
  and,
  or,
  sql,
  ilike,
  aliasedTable,
  isNotNull,
  isNull,
  notInArray,
  inArray,
  type SQL,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  intakeItems,
  intakeItemComments,
  agentSessionActivities,
  agentSessions,
} from "../schema";
import type { AuthAdapter } from "../lib/auth-adapter";
import { requireAdmin, json } from "./_shared";

// GET /api/admin/backlog — admin-only intake list with filter / sort
// / pagination. Returns RAW rows (no user-join, no display-label
// composition) — consumers wrap this in their own route handler and
// enrich each item with their auth system's user metadata + label
// rules. The shim pattern keeps this handler portable across any
// project that uses the schema; specforge's identity helpers
// (handleOrRole, formatPublicHandle) live in specforge.
//
// Self-joins included: duplicate-of parent + blocked-by parent (both
// using the same intake_items table) + agent_sessions for the "via
// session X" badge (intake #239).
//
// Comments fetched per visible-row in one batch — only ids + bodies
// + authorUserId. Consumer's shim enriches authorLabel from its own
// user table.

// Allow up to 1000 — consumers (specforge intake #1026) want to drop
// the pagination UI entirely and render all tickets in one scroll. 1000
// is the safe DOM-render ceiling; beyond that input lag becomes a risk.
const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100, 200, 500, 1000]);

type SortMode = "default" | "priority" | "newest" | "oldest" | "recent";

export type BacklogListDeps = {
  adapter: AuthAdapter;
  db: any;
};

export async function handleBacklogList(
  req: Request,
  deps: BacklogListDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const stateFilter = url.searchParams.get("state");
  const kindFilter = url.searchParams.get("kind");
  const categoryFilter = url.searchParams.get("category");
  // #1078 — assignee filter. Two forms:
  //   ?assignee=unassigned → filter to assignee_user_id IS NULL
  //   ?assignee=<uuid>     → filter to assignee_user_id = <uuid>
  // "Assigned to me" is encoded as the consumer translating the
  // current user's id into the uuid form before issuing the request.
  // The kit stays user-identity-agnostic — see the schema note above.
  const assigneeFilter = url.searchParams.get("assignee");
  const q = url.searchParams.get("q")?.trim();
  const sortMode = (url.searchParams.get("sort") ?? "default") as SortMode;
  const pageSizeRaw = parseInt(url.searchParams.get("pageSize") ?? "50", 10);
  const pageSize = ALLOWED_PAGE_SIZES.has(pageSizeRaw) ? pageSizeRaw : 50;
  const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const offset = (page - 1) * pageSize;

  const hasParam = (k: string): "yes" | "no" | null => {
    const v = url.searchParams.get(k);
    return v === "yes" || v === "no" ? v : null;
  };
  const hasDecision = hasParam("hasDecision");
  const hasReasoning = hasParam("hasReasoning");
  const hasPriority = hasParam("hasPriority");
  const hasBlock = hasParam("hasBlock");

  // Self-joins: duplicate-of + blocked-by.
  const parent = aliasedTable(intakeItems, "parent");
  const blocker = aliasedTable(intakeItems, "blocker");

  let qb = deps.db
    .select({
      id: intakeItems.id,
      seq: intakeItems.seq,
      kind: intakeItems.kind,
      title: intakeItems.title,
      description: intakeItems.description,
      pageUrl: intakeItems.pageUrl,
      context: intakeItems.context,
      state: intakeItems.state,
      priority: intakeItems.priority,
      summary: intakeItems.summary,
      triageReasoning: intakeItems.triageReasoning,
      triagedAt: intakeItems.triagedAt,
      createdAt: intakeItems.createdAt,
      updatedAt: intakeItems.updatedAt,
      sourceBugReportId: intakeItems.sourceBugReportId,
      decisionOptions: intakeItems.decisionOptions,
      decisionChoice: intakeItems.decisionChoice,
      decisionChosenAt: intakeItems.decisionChosenAt,
      shipApprovedAt: intakeItems.shipApprovedAt,
      shipApprovedByUserId: intakeItems.shipApprovedByUserId,
      duplicateOfIntakeItemId: intakeItems.duplicateOfIntakeItemId,
      duplicateOfSeq: parent.seq,
      duplicateOfTitle: parent.title,
      duplicateOfState: parent.state,
      blockStatus: intakeItems.blockStatus,
      blockedByIntakeItemId: intakeItems.blockedByIntakeItemId,
      blockedBySeq: blocker.seq,
      blockedByTitle: blocker.title,
      blockedByState: blocker.state,
      category: intakeItems.category,
      // Session-tracking join (intake #239): "via <session>" badge.
      createdInSessionId: agentSessions.id,
      createdInSessionDisplayName: agentSessions.displayName,
      // Raw reporter id — consumer's shim enriches with handle/role.
      reporterUserId: intakeItems.reporterUserId,
      // #1078 — assignee for the per-card assignee chip + the
      // assignee filter chips on /admin/backlog.
      assigneeUserId: intakeItems.assigneeUserId,
    })
    .from(intakeItems)
    .leftJoin(parent, eq(parent.id, intakeItems.duplicateOfIntakeItemId))
    .leftJoin(blocker, eq(blocker.id, intakeItems.blockedByIntakeItemId))
    .leftJoin(
      agentSessionActivities,
      and(
        eq(agentSessionActivities.refTable, "intake_items"),
        eq(agentSessionActivities.refId, intakeItems.id),
        eq(agentSessionActivities.kind, "intake_created"),
      ),
    )
    .leftJoin(
      agentSessions,
      eq(agentSessions.id, agentSessionActivities.sessionId),
    )
    .$dynamic();

  const conditions: SQL[] = [];
  if (stateFilter === "active") {
    conditions.push(
      notInArray(intakeItems.state, ["shipped", "provisioned", "declined", "duplicate"]),
    );
  } else if (stateFilter === "parked") {
    conditions.push(
      notInArray(intakeItems.state, ["shipped", "provisioned", "declined", "duplicate"]),
    );
    conditions.push(
      or(eq(intakeItems.blockStatus, "parked"), isNotNull(intakeItems.parkedAt))!,
    );
  } else if (stateFilter === "blocked") {
    conditions.push(
      notInArray(intakeItems.state, ["shipped", "provisioned", "declined", "duplicate"]),
    );
    conditions.push(
      or(
        eq(intakeItems.blockStatus, "blocked"),
        isNotNull(intakeItems.blockedByIntakeItemId),
      )!,
    );
  } else if (stateFilter) {
    conditions.push(eq(intakeItems.state, stateFilter));
  }
  if (kindFilter) conditions.push(eq(intakeItems.kind, kindFilter));
  if (categoryFilter) {
    if (categoryFilter === "uncategorised") {
      conditions.push(isNull(intakeItems.category));
    } else {
      conditions.push(eq(intakeItems.category, categoryFilter));
    }
  }
  // #1078 — assignee filter. UUID-shaped values are validated by a
  // permissive regex to avoid sending malformed input to Postgres.
  // The kit never accepts the sentinel "me" — consumers translate
  // their own user id BEFORE building the request URL.
  if (assigneeFilter) {
    if (assigneeFilter === "unassigned") {
      conditions.push(isNull(intakeItems.assigneeUserId));
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assigneeFilter)) {
      conditions.push(eq(intakeItems.assigneeUserId, assigneeFilter));
    }
    // any other value silently ignored — bad input shouldn't 400 the
    // whole list; the chips will refetch with a valid value.
  }
  if (hasDecision === "yes") conditions.push(isNotNull(intakeItems.decisionChoice));
  if (hasDecision === "no") conditions.push(isNull(intakeItems.decisionChoice));
  if (hasReasoning === "yes")
    conditions.push(sql`${intakeItems.triageReasoning} IS NOT NULL AND ${intakeItems.triageReasoning} <> ''`);
  if (hasReasoning === "no")
    conditions.push(sql`${intakeItems.triageReasoning} IS NULL OR ${intakeItems.triageReasoning} = ''`);
  if (hasPriority === "yes") conditions.push(isNotNull(intakeItems.priority));
  if (hasPriority === "no") conditions.push(isNull(intakeItems.priority));
  if (hasBlock === "yes") conditions.push(isNotNull(intakeItems.blockStatus));
  if (hasBlock === "no") conditions.push(isNull(intakeItems.blockStatus));

  const exactSeqMatch = q && /^#\d+$/.test(q) ? parseInt(q.slice(1), 10) : null;
  const numericQuery = q && /^\d+$/.test(q) ? parseInt(q, 10) : null;
  if (q) {
    if (exactSeqMatch != null) {
      conditions.push(eq(intakeItems.seq, exactSeqMatch));
    } else {
      const stripped = q.startsWith("#") ? q.slice(1) : q;
      const pattern = `%${stripped.replace(/[%_]/g, (m) => "\\" + m)}%`;
      conditions.push(
        or(
          ilike(intakeItems.title, pattern),
          ilike(intakeItems.description, pattern),
          sql`${intakeItems.seq}::text ILIKE ${pattern}`,
        )!,
      );
    }
  }
  if (conditions.length > 0) {
    qb = qb.where(and(...conditions)!);
  }

  // META-first prefix sort (DEFAULT mode only).
  const metaFirst = sql`CASE WHEN ${intakeItems.title} ILIKE 'Meta:%' THEN 0 ELSE 1 END`;
  const exactSeqBoost =
    numericQuery != null
      ? sql`CASE WHEN ${intakeItems.seq} = ${numericQuery} THEN 0 ELSE 1 END`
      : null;
  const withBoost = <T extends SQL | PgColumn>(rest: T[]): Array<SQL | T> =>
    exactSeqBoost ? [exactSeqBoost, ...rest] : rest;

  const orderClauses: Array<SQL | PgColumn> = (() => {
    switch (sortMode) {
      case "priority":
        return withBoost([sql`coalesce(${intakeItems.priority}, 999999)`, intakeItems.seq]);
      case "newest":
        return withBoost([desc(intakeItems.seq)]);
      case "oldest":
        return withBoost([asc(intakeItems.seq)]);
      case "recent":
        return withBoost([desc(intakeItems.updatedAt)]);
      case "default":
      default:
        if (stateFilter === "ready_to_ship") {
          return withBoost([
            metaFirst,
            sql`CASE WHEN ${intakeItems.blockStatus} IS NOT NULL THEN 1 ELSE 0 END`,
            asc(intakeItems.seq),
          ]);
        }
        return withBoost([
          sql`CASE ${intakeItems.state} WHEN 'ready_to_ship' THEN 0 WHEN 'accepted' THEN 1 WHEN 'pending' THEN 2 WHEN 'requested' THEN 2 WHEN 'declined' THEN 3 WHEN 'shipped' THEN 4 WHEN 'provisioned' THEN 4 WHEN 'duplicate' THEN 5 ELSE 6 END`,
          metaFirst,
          sql`CASE WHEN ${intakeItems.blockStatus} IS NOT NULL THEN 1 ELSE 0 END`,
          sql`CASE WHEN ${intakeItems.shipApprovedAt} IS NOT NULL THEN 0 ELSE 1 END`,
          sql`coalesce(${intakeItems.priority}, 999999)`,
          intakeItems.seq,
        ]);
    }
  })();

  const rows = await qb.orderBy(...orderClauses).limit(pageSize).offset(offset);

  // Total count.
  let countQb = deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(intakeItems)
    .$dynamic();
  if (conditions.length > 0) {
    countQb = countQb.where(and(...conditions)!);
  }
  const [{ n: total }] = await countQb;

  // Comments per visible ticket — raw, no author label composition.
  const ticketIds = rows.map((r: any) => r.id as string);
  const commentRows = ticketIds.length === 0
    ? []
    : await deps.db
        .select({
          id: intakeItemComments.id,
          intakeItemId: intakeItemComments.intakeItemId,
          authorUserId: intakeItemComments.authorUserId,
          body: intakeItemComments.body,
          createdAt: intakeItemComments.createdAt,
          editedAt: intakeItemComments.editedAt,
        })
        .from(intakeItemComments)
        .where(inArray(intakeItemComments.intakeItemId, ticketIds))
        .orderBy(asc(intakeItemComments.createdAt));

  const commentsByTicketId = new Map<string, any[]>();
  for (const c of commentRows) {
    const arr = commentsByTicketId.get(c.intakeItemId) ?? [];
    arr.push(c);
    commentsByTicketId.set(c.intakeItemId, arr);
  }

  const items = rows.map((r: any) => ({
    ...r,
    comments: commentsByTicketId.get(r.id) ?? [],
  }));

  return json({ items, total, page, pageSize });
}
