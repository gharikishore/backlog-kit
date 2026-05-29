import { eq, and, isNotNull, or, notInArray } from "drizzle-orm";
import { intakeItems } from "../schema";
import { broadcastBacklogChange } from "../lib/backlog-events";
import { insertAuditEntry } from "../lib/audit";
import type { AuthAdapter } from "../lib/auth-adapter";
import { requireAdmin, json } from "./_shared";

// PATCH /api/admin/backlog/[id] — triage + prioritize a single intake.
//
// Admin-only. Body fields are all optional; supply just what you want
// to change. State transitions trigger:
//   - audit_log row with before/after snapshot
//   - cascade auto-unblock for any tickets blocked-by this one when
//     state moves to a terminal value (shipped/declined/duplicate/provisioned)
//   - parked_at stamp on a deliberate demote (accepted/ready_to_ship → pending)
//   - ship_approved_at clear on transitions to shipped/provisioned terminals
//   - broadcastBacklogChange so SSE-connected clients refetch
//
// Cross-field validation:
//   - state='duplicate' requires duplicateOfIntakeItemId OR duplicateOfSeq
//   - description cannot be empty (NOT NULL constraint)
//   - duplicateOfSeq/blockedBySeq are resolved to ids by lookup

const TERMINAL_STATES = new Set(["shipped", "declined", "duplicate", "provisioned"]);

const ALLOWED_STATES = new Set([
  // generic work-item lifecycle
  "pending",
  "accepted",
  "ready_to_ship",
  "shipped",
  // signup lifecycle
  "requested",
  "provisioned",
  // shared terminals
  "declined",
  "duplicate",
]);

type Body = {
  state?: string;
  summary?: string | null;
  triageReasoning?: string;
  priority?: number | null;
  decisionChoice?: string | null;
  shipApproved?: boolean;
  duplicateOfSeq?: number | null;
  decisionOptions?: Array<{ value: string; label: string; detail?: string }> | null;
  blockStatus?: "parked" | "blocked" | null;
  blockedBySeq?: number | null;
  title?: string | null;
  description?: string;
  category?: string | null;
  /** #1077 — assignee. Pass a uuid to assign, null to clear. */
  assigneeUserId?: string | null;
};

export type BacklogItemPatchDeps = {
  adapter: AuthAdapter;
  /** Drizzle db handle — must support .select / .update / .insert / .delete. */
  db: any;
};

export async function handleBacklogItemPatch(
  req: Request,
  id: string,
  deps: BacklogItemPatchDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;
  const adminUser = auth;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return json({ error: "Invalid request body." }, 400);

  // Read current row first so we can validate cross-field invariants
  // (the duplicate flip needs to know whether duplicateOfIntakeItemId is
  // already set, in which case the caller doesn't have to re-supply it).
  const [before] = await deps.db
    .select()
    .from(intakeItems)
    .where(eq(intakeItems.id, id))
    .limit(1);
  if (!before) return json({ error: "Not found." }, 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  let auditAction = "intake.touched";

  // Resolve duplicateOfSeq → duplicate_of_intake_item_id. Done before
  // the state check so a single PATCH can flip state=duplicate AND set
  // the reference in one go.
  if (body.duplicateOfSeq !== undefined) {
    if (body.duplicateOfSeq === null) {
      updates.duplicateOfIntakeItemId = null;
    } else if (typeof body.duplicateOfSeq === "number" && Number.isFinite(body.duplicateOfSeq)) {
      if (body.duplicateOfSeq === before.seq) {
        return json({ error: "An item can't be a duplicate of itself." }, 400);
      }
      const [parent] = await deps.db
        .select({ id: intakeItems.id })
        .from(intakeItems)
        .where(eq(intakeItems.seq, body.duplicateOfSeq))
        .limit(1);
      if (!parent) {
        return json({ error: `No item with #${body.duplicateOfSeq} found.` }, 400);
      }
      updates.duplicateOfIntakeItemId = parent.id;
    } else {
      return json({ error: "duplicateOfSeq must be a number or null." }, 400);
    }
  }

  // Resolve blockedBySeq → blocked_by_intake_item_id.
  if (body.blockedBySeq !== undefined) {
    if (body.blockedBySeq === null) {
      updates.blockedByIntakeItemId = null;
    } else if (typeof body.blockedBySeq === "number" && Number.isFinite(body.blockedBySeq)) {
      if (body.blockedBySeq === before.seq) {
        return json({ error: "An item can't block itself." }, 400);
      }
      const [parent] = await deps.db
        .select({ id: intakeItems.id })
        .from(intakeItems)
        .where(eq(intakeItems.seq, body.blockedBySeq))
        .limit(1);
      if (!parent) {
        return json({ error: `No item with #${body.blockedBySeq} found.` }, 400);
      }
      updates.blockedByIntakeItemId = parent.id;
    } else {
      return json({ error: "blockedBySeq must be a number or null." }, 400);
    }
  }

  if (body.blockStatus !== undefined) {
    if (body.blockStatus !== null && body.blockStatus !== "parked" && body.blockStatus !== "blocked") {
      return json({ error: "blockStatus must be 'parked', 'blocked', or null." }, 400);
    }
    updates.blockStatus = body.blockStatus;
    if (body.blockStatus === null && body.blockedBySeq === undefined) {
      updates.blockedByIntakeItemId = null;
    }
    auditAction = body.blockStatus === null ? "intake.block_cleared" : `intake.block_${body.blockStatus}`;
  }

  // Title / description edits.
  if (body.title !== undefined) {
    const v = body.title === null ? null : String(body.title).trim().slice(0, 280);
    updates.title = v;
    auditAction = "intake.edited";
  }
  if (body.description !== undefined) {
    const v = String(body.description).trim();
    if (v.length === 0) {
      return json(
        { error: "description can't be blank. Use null/empty title instead if you want to drop the headline." },
        400,
      );
    }
    updates.description = v.slice(0, 8000);
    auditAction = "intake.edited";
  }

  if (body.category !== undefined) {
    if (body.category === null) {
      updates.category = null;
    } else if (typeof body.category === "string") {
      const trimmed = body.category.trim();
      updates.category = trimmed.length === 0 ? null : trimmed.slice(0, 60);
    } else {
      return json({ error: "category must be a string or null." }, 400);
    }
    auditAction = "intake.categorised";
  }

  // #1077 — assignee assignment. UUID-validated before hitting the FK
  // column. Consumer is responsible for ensuring the uuid resolves to a
  // real user; the kit doesn't enforce that (would require depending on
  // a consumer-specific `users` table — see schema note).
  if (body.assigneeUserId !== undefined) {
    if (body.assigneeUserId === null) {
      updates.assigneeUserId = null;
      auditAction = "intake.unassigned";
    } else if (
      typeof body.assigneeUserId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.assigneeUserId)
    ) {
      updates.assigneeUserId = body.assigneeUserId;
      auditAction = "intake.assigned";
    } else {
      return json({ error: "assigneeUserId must be a uuid or null." }, 400);
    }
  }

  if (body.state !== undefined) {
    if (!ALLOWED_STATES.has(body.state)) {
      return json(
        { error: `state must be one of: ${[...ALLOWED_STATES].join(", ")}` },
        400,
      );
    }
    // duplicate requires a parent reference.
    if (body.state === "duplicate") {
      const willHaveParent =
        updates.duplicateOfIntakeItemId !== undefined
          ? updates.duplicateOfIntakeItemId !== null
          : before.duplicateOfIntakeItemId !== null;
      if (!willHaveParent) {
        return json(
          { error: "Mark as duplicate requires a reference to the parent item (duplicateOfSeq)." },
          400,
        );
      }
    }

    // #542 piece 3 — block manual META ship/decline/duplicate with
    // non-terminal children. METAs are umbrellas; they shouldn't reach
    // a terminal state until the children do. Migration 0064 already
    // auto-advances META → ready_to_ship when children all terminalize
    // (and 0046 cascades unblocks). This guard is the manual-override
    // defense: it blocks a user-driven Ship click on a META that still
    // has open children. The 409 lists the first 5 open child seqs so
    // the user can see exactly what's still in flight.
    const isMeta = before.pageUrl?.startsWith("meta:") ?? false;
    if (isMeta && TERMINAL_STATES.has(body.state)) {
      const openChildren = await deps.db
        .select({ seq: intakeItems.seq })
        .from(intakeItems)
        .where(
          and(
            or(
              eq(intakeItems.parentIntakeItemId, before.id),
              eq(intakeItems.blockedByIntakeItemId, before.id),
            ),
            notInArray(intakeItems.state, [
              "shipped",
              "declined",
              "duplicate",
              "provisioned",
            ]),
          ),
        );
      if (openChildren.length > 0) {
        const seqList = openChildren
          .slice(0, 5)
          .map((c) => `#${c.seq}`)
          .join(", ");
        const more = openChildren.length > 5 ? `, +${openChildren.length - 5} more` : "";
        return json(
          {
            error: `META cannot be ${body.state} while ${openChildren.length} child${openChildren.length === 1 ? "" : "ren"} are still open (${seqList}${more}). Resolve the children first; the auto-advance trigger (migration 0064) will then move this META to ready_to_ship on its own.`,
          },
          409,
        );
      }
    }

    updates.state = body.state;
    updates.triagedAt = new Date();
    updates.triagedByUserId = adminUser.id;
    auditAction = `intake.${body.state}`;
    if (body.state === "shipped" || body.state === "provisioned") {
      updates.shipApprovedAt = null;
      updates.shipApprovedByUserId = null;
    }
    // park signal: a deliberate demote from accepted/ready_to_ship → pending.
    if (
      body.state === "pending" &&
      (before.state === "accepted" || before.state === "ready_to_ship")
    ) {
      updates.parkedAt = new Date();
    } else if (body.state === "accepted") {
      updates.parkedAt = null;
    }
  }

  if (body.summary !== undefined) {
    if (body.summary === null) {
      updates.summary = null;
    } else if (typeof body.summary === "string") {
      const trimmed = body.summary.trim();
      updates.summary = trimmed.length === 0 ? null : trimmed.slice(0, 140);
    } else {
      return json({ error: "summary must be a string or null" }, 400);
    }
  }
  if (body.triageReasoning !== undefined) {
    updates.triageReasoning = typeof body.triageReasoning === "string"
      ? body.triageReasoning.slice(0, 4000)
      : null;
  }
  if (body.priority !== undefined) {
    if (body.priority === null) {
      updates.priority = null;
    } else if (typeof body.priority === "number" && Number.isFinite(body.priority)) {
      updates.priority = Math.round(body.priority);
    } else {
      return json({ error: "priority must be a number or null" }, 400);
    }
  }
  if (body.decisionOptions !== undefined) {
    if (body.decisionOptions === null) {
      updates.decisionOptions = null;
      updates.decisionChoice = null;
      updates.decisionChosenAt = null;
      updates.decisionChosenByUserId = null;
    } else if (Array.isArray(body.decisionOptions)) {
      const cleaned = body.decisionOptions
        .filter((o) => o && typeof o.value === "string" && typeof o.label === "string")
        .map((o) => ({
          value: o.value,
          label: o.label,
          ...(typeof o.detail === "string" ? { detail: o.detail } : {}),
        }));
      if (cleaned.length === 0) {
        return json({ error: "decisionOptions must contain at least one {value, label} entry." }, 400);
      }
      updates.decisionOptions = cleaned;
    } else {
      return json({ error: "decisionOptions must be an array or null." }, 400);
    }
  }
  if (body.decisionChoice !== undefined) {
    updates.decisionChoice = body.decisionChoice;
    updates.decisionChosenAt = body.decisionChoice == null ? null : new Date();
    updates.decisionChosenByUserId = body.decisionChoice == null ? null : adminUser.id;
    if (body.decisionChoice != null) auditAction = "intake.decision_recorded";
  }
  if (body.shipApproved !== undefined) {
    if (body.shipApproved === true) {
      updates.shipApprovedAt = new Date();
      updates.shipApprovedByUserId = adminUser.id;
      auditAction = "intake.ship_approved";
    } else {
      updates.shipApprovedAt = null;
      updates.shipApprovedByUserId = null;
      auditAction = "intake.ship_unapproved";
    }
  }

  const [after] = await deps.db
    .update(intakeItems)
    .set(updates)
    .where(eq(intakeItems.id, id))
    .returning();

  await insertAuditEntry(
    {
      actorUserId: adminUser.id,
      action: auditAction,
      targetTable: "intake_items",
      targetId: id,
      before: {
        state: before.state,
        priority: before.priority,
        summary: before.summary,
        triageReasoning: before.triageReasoning,
        decisionChoice: before.decisionChoice,
        shipApprovedAt: before.shipApprovedAt,
        duplicateOfIntakeItemId: before.duplicateOfIntakeItemId,
        blockStatus: before.blockStatus,
        blockedByIntakeItemId: before.blockedByIntakeItemId,
        category: before.category,
        // #1079 — assignee in the audit snapshot so the history pane
        // can reconstruct assign/reassign transitions (#1080).
        assigneeUserId: before.assigneeUserId,
      },
      after: {
        state: after.state,
        priority: after.priority,
        summary: after.summary,
        triageReasoning: after.triageReasoning,
        decisionChoice: after.decisionChoice,
        shipApprovedAt: after.shipApprovedAt,
        duplicateOfIntakeItemId: after.duplicateOfIntakeItemId,
        blockStatus: after.blockStatus,
        blockedByIntakeItemId: after.blockedByIntakeItemId,
        category: after.category,
        assigneeUserId: after.assigneeUserId,
      },
    },
    { db: deps.db, getImpersonatorId: deps.adapter.getImpersonatorId },
  );

  // Cascade auto-unblock: when this item transitions to a terminal,
  // clear block_status + blocked_by on any dependents.
  const stateNewlyTerminal =
    body.state !== undefined &&
    TERMINAL_STATES.has(after.state) &&
    !TERMINAL_STATES.has(before.state);
  if (stateNewlyTerminal) {
    const dependents = await deps.db
      .select()
      .from(intakeItems)
      .where(and(eq(intakeItems.blockedByIntakeItemId, id), isNotNull(intakeItems.blockStatus)));
    for (const dep of dependents) {
      const now = new Date();
      const [updatedDep] = await deps.db
        .update(intakeItems)
        .set({
          blockStatus: null,
          blockedByIntakeItemId: null,
          updatedAt: now,
        })
        .where(eq(intakeItems.id, dep.id))
        .returning();
      await insertAuditEntry(
        {
          actorUserId: adminUser.id,
          action: "intake.block_auto_cleared",
          targetTable: "intake_items",
          targetId: dep.id,
          before: {
            state: dep.state,
            blockStatus: dep.blockStatus,
            blockedByIntakeItemId: dep.blockedByIntakeItemId,
          },
          after: {
            state: updatedDep.state,
            blockStatus: updatedDep.blockStatus,
            blockedByIntakeItemId: updatedDep.blockedByIntakeItemId,
          },
          metadata: {
            reason: `Blocker #${before.seq} reached terminal state '${after.state}'.`,
            blockerSeq: before.seq,
            blockerNewState: after.state,
          },
        },
        { db: deps.db, getImpersonatorId: deps.adapter.getImpersonatorId },
      );
    }
  }

  broadcastBacklogChange(auditAction);
  return json({ ok: true, item: after });
}
