import { pgTable, uuid, text, timestamp, jsonb, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Audit log — every state change writes a row here. The before/after JSONB
// columns capture the row state pre/post change for forensic investigations.
//
// Intake #846 (META #88): RANGE-partitioned on `at` (monthly partitions).
// Postgres requires the PK to include the partition key, so the PK is
// composite (id, at) instead of just (id). `id` is uuid-unique by
// construction; the composite is a Postgres constraint, not a semantic change.
//
// Partitioning + child partitions + rollover are managed at the DDL level
// (see migration 0099 + src/lib/audit-log-partition-rollover.ts + the
// cold-archive cycle from intake #648). Application queries flow through
// the parent table transparently.
//
// SHARED-PACKAGE NOTE: user-FK references omitted; DB-level constraints stay.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").notNull().defaultRandom(),
    actorUserId: uuid("actor_user_id"),
    impersonatedByUserId: uuid("impersonated_by_user_id"),
    action: text("action").notNull(),
    targetTable: text("target_table").notNull(),
    targetId: uuid("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: "audit_log_pkey", columns: [t.id, t.at] }),
    actorIdx: index("audit_log_actor_idx").on(t.actorUserId),
    targetIdx: index("audit_log_target_idx").on(t.targetTable, t.targetId),
    actionIdx: index("audit_log_action_idx").on(t.action),
    atIdx: index("audit_log_at_idx").on(t.at),
    impersonatedByIdx: index("audit_log_impersonated_by_idx")
      .on(t.impersonatedByUserId)
      .where(sql`impersonated_by_user_id IS NOT NULL`),
  })
);

export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
