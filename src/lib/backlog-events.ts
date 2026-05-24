import { EventEmitter } from "node:events";

// In-process pub/sub for /admin/backlog change notifications.
//
// Limitation: each Node instance has its own emitter. On a multi-instance
// serverless deploy, a write on instance A won't notify clients connected
// to instance B. Acceptable for single-process dev + small deploys;
// upgrade to Supabase Realtime or Redis pub/sub when scaling past one
// instance. See specforge intake #67 for the original discussion.
//
// Cross-project safety: each consuming app uses its own
// globalThis-keyed emitter (different Symbol.for keys). The key is
// scoped to "@local/backlog-kit.backlogEvents" so it never
// collides with consumer-owned emitters.

export type BacklogChangeEvent = {
  reason: string;
  at: string;
};

class BacklogEmitter extends EventEmitter {}

const GLOBAL_KEY = Symbol.for("@local/backlog-kit.backlogEvents");
type GlobalWithEmitter = typeof globalThis & {
  [GLOBAL_KEY]?: BacklogEmitter;
};
const g = globalThis as GlobalWithEmitter;

export const backlogEvents: BacklogEmitter =
  g[GLOBAL_KEY] ?? (g[GLOBAL_KEY] = new BacklogEmitter());
backlogEvents.setMaxListeners(50);

export function broadcastBacklogChange(reason: string): void {
  backlogEvents.emit("changed", { reason, at: new Date().toISOString() } satisfies BacklogChangeEvent);
}
