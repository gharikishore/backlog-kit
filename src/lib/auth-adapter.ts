// AuthAdapter — the interface consuming apps implement to bridge
// their auth stack into the feedback-triage handlers.
//
// The package never imports auth helpers directly. Instead, each
// consumer constructs an `AuthAdapter` object pointing at its own
// auth wiring (Supabase, NextAuth, Clerk, custom cookie session…),
// and passes it into the API handlers as `deps.adapter`.
//
// Identity contract: the only things the package needs to know about
// a user are `id`, `systemRole`, and a label for the audit trail.
// Consumers may extend the returned object with their own fields;
// the package ignores them.

export type SessionUser = {
  /** UUID — primary key in the consumer's `users` table. */
  id: string;
  /**
   * Role label that gates admin-only operations. `"admin"` is the
   * canonical privileged value. Consumers may use any string for
   * other roles; the package only checks for `"admin"`.
   */
  systemRole: string | null;
  /**
   * Optional display label for audit trails (handle, email,
   * displayName — consumer's choice). Not used for auth decisions.
   */
  label?: string | null;
};

export type AuthAdapter = {
  /**
   * Resolve the effective session user from a request. Should return
   * the impersonated user when the consumer's auth flow has an
   * active impersonation; the real user otherwise. Returns null when
   * no session.
   */
  readSessionUser: (req: Request) => Promise<SessionUser | null>;

  /**
   * Returns the real admin's user id when this request is happening
   * inside an impersonation context, else null. Used by the audit
   * helper to auto-stamp `audit_log.impersonated_by_user_id`.
   */
  getImpersonatorId: () => Promise<string | null>;
};
