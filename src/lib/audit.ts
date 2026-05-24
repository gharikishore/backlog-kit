import { auditLog, type NewAuditEntry } from "../schema";

// Auto-stamps audit_log.impersonated_by_user_id when the consumer's
// adapter reports an active admin-impersonation context.
//
// Cross-app caveat: the package doesn't know what auth system the
// consumer uses (Supabase, NextAuth, Clerk, custom). The consumer
// passes its own `getImpersonatorId` function via `AuditContext`.
// Callers that already know the impersonator (e.g. the impersonation
// endpoint itself) can pre-set `impersonatedByUserId` on the value —
// the auto-stamp only fills in when the field is `undefined`.

export type AuditContext = {
  /** Drizzle db handle OR an open tx — anything with `.insert`. */
  db: { insert: (table: typeof auditLog) => { values: (v: NewAuditEntry) => Promise<unknown> } };
  /**
   * Returns the real admin's id when this request is happening
   * inside an impersonation context, else null. Consumers wire this
   * to their own auth stack.
   */
  getImpersonatorId: () => Promise<string | null>;
};

export async function insertAuditEntry(
  values: NewAuditEntry,
  ctx: AuditContext,
): Promise<void> {
  const impersonatedByUserId =
    values.impersonatedByUserId !== undefined
      ? values.impersonatedByUserId
      : await ctx.getImpersonatorId();
  await ctx.db.insert(auditLog).values({ ...values, impersonatedByUserId });
}
