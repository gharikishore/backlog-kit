// POST /api/admin/backlog/[id]/watchers — add a watcher to an intake.
// DELETE /api/admin/backlog/[id]/watchers/[userId] — remove a watcher.
//
// Watchers are users who get notified on intake activity (state
// changes, comments, mentions) but DON'T own the work — that's the
// assignee. UNIQUE (intake_item_id, user_id) in the schema (#1076 +
// migration 0114) prevents duplicate watcher rows for the same user.
//
// Auth model:
//   - Add: any authenticated admin can add ANY user as a watcher
//     (including themselves). For now we don't expose this to
//     non-admin users; if/when that lands the kit handler grows a
//     permission check on the body's userId vs the caller.
//   - Remove: any authenticated admin can remove any watcher. The
//     "users can remove their own watcher entry" rule is a follow-up
//     since today only admins reach the backlog UI.

import { eq, and } from "drizzle-orm";
import { intakeItemWatchers, intakeItems } from "../schema";
import { insertAuditEntry } from "../lib/audit";
import { broadcastBacklogChange } from "../lib/backlog-events";
import type { AuthAdapter } from "../lib/auth-adapter";
import { requireAdmin, json } from "./_shared";

export type BacklogWatchersDeps = {
  adapter: AuthAdapter;
  db: any;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleAddWatcher(
  req: Request,
  intakeItemId: string,
  deps: BacklogWatchersDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;
  const adminUser = auth;

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  if (!body || typeof body.userId !== "string" || !UUID_REGEX.test(body.userId)) {
    return json({ error: "userId (uuid) required in body" }, 400);
  }

  // Confirm intake exists (cheap pk lookup).
  const [intake] = await deps.db
    .select({ id: intakeItems.id })
    .from(intakeItems)
    .where(eq(intakeItems.id, intakeItemId))
    .limit(1);
  if (!intake) return json({ error: "Intake not found" }, 404);

  // Insert. ON CONFLICT DO NOTHING because the UNIQUE
  // (intake_item_id, user_id) treats duplicate adds as a no-op.
  const inserted = await deps.db
    .insert(intakeItemWatchers)
    .values({
      intakeItemId,
      userId: body.userId,
      addedByUserId: adminUser.id,
    })
    .onConflictDoNothing({
      target: [intakeItemWatchers.intakeItemId, intakeItemWatchers.userId],
    })
    .returning({ id: intakeItemWatchers.id });

  const wasAdded = inserted.length > 0;

  if (wasAdded) {
    await insertAuditEntry(
      {
        actorUserId: adminUser.id,
        action: "intake.watcher_added",
        targetTable: "intake_items",
        targetId: intakeItemId,
        before: null,
        after: { watcherUserId: body.userId },
        metadata: { watcherUserId: body.userId },
      },
      { db: deps.db, getImpersonatorId: deps.adapter.getImpersonatorId },
    );
    broadcastBacklogChange("watcher_changed");
  }

  return json({ ok: true, added: wasAdded, watcherId: inserted[0]?.id ?? null });
}

export async function handleRemoveWatcher(
  req: Request,
  intakeItemId: string,
  watcherUserId: string,
  deps: BacklogWatchersDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;
  const adminUser = auth;

  if (!UUID_REGEX.test(watcherUserId)) {
    return json({ error: "userId must be a uuid" }, 400);
  }

  const deleted = await deps.db
    .delete(intakeItemWatchers)
    .where(
      and(
        eq(intakeItemWatchers.intakeItemId, intakeItemId),
        eq(intakeItemWatchers.userId, watcherUserId),
      ),
    )
    .returning({ id: intakeItemWatchers.id });

  const wasRemoved = deleted.length > 0;

  if (wasRemoved) {
    await insertAuditEntry(
      {
        actorUserId: adminUser.id,
        action: "intake.watcher_removed",
        targetTable: "intake_items",
        targetId: intakeItemId,
        before: { watcherUserId },
        after: null,
        metadata: { watcherUserId },
      },
      { db: deps.db, getImpersonatorId: deps.adapter.getImpersonatorId },
    );
    broadcastBacklogChange("watcher_changed");
  }

  return json({ ok: true, removed: wasRemoved });
}
