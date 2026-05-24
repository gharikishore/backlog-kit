import { backlogEvents, type BacklogChangeEvent } from "../lib/backlog-events";
import type { AuthAdapter } from "../lib/auth-adapter";
import { requireAdmin } from "./_shared";

// GET /api/admin/backlog/events — admin-only SSE stream. The
// /admin/backlog page subscribes and refetches whenever a 'changed'
// event arrives. Events fire on every PATCH/reorder, plus on explicit
// calls to /api/admin/backlog/events/bump for writes that bypass the
// API (one-off SQL scripts).
//
// 25s heartbeat keeps proxies / load balancers from idling the
// connection closed. The req.signal abort handler removes the listener
// so we don't leak emitters across reconnects.

export type BacklogEventsDeps = {
  adapter: AuthAdapter;
};

export async function handleBacklogEventsGet(
  req: Request,
  deps: BacklogEventsDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(data));
        } catch {
          /* connection gone */
        }
      };

      send(`: connected ${new Date().toISOString()}\n\n`);

      const onChange = (evt: BacklogChangeEvent) => {
        send(`event: changed\ndata: ${JSON.stringify(evt)}\n\n`);
      };
      backlogEvents.on("changed", onChange);

      const heartbeat = setInterval(() => send(`: heartbeat\n\n`), 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        backlogEvents.off("changed", onChange);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
