import type { AuthAdapter, SessionUser } from "../lib/auth-adapter";

// Shared helpers for the API handlers. Internal — not part of the
// public package API.

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Resolve the session user and reject non-admins with a 401/403
 * Response. Returns the admin SessionUser on success, or a Response
 * on rejection (caller returns it directly).
 *
 * Convention check: a user is "admin" iff `systemRole === "admin"`.
 * Consumers using different role labels supply their own gate via
 * a custom AuthAdapter wrapper (or extend the contract — see #974
 * description).
 */
export async function requireAdmin(
  req: Request,
  adapter: AuthAdapter,
): Promise<SessionUser | Response> {
  const u = await adapter.readSessionUser(req);
  if (!u) return json({ error: "Sign in required." }, 401);
  if (u.systemRole !== "admin") return json({ error: "Admin only." }, 403);
  return u;
}
