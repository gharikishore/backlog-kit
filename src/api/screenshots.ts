import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { R2Context } from "../lib/screenshot-r2";
import type { AuthAdapter } from "../lib/auth-adapter";

// GET /api/screenshots/<key>/... handler — admin-gated proxy that
// streams an R2-stored screenshot back through the consumer app. Why
// proxy instead of presigned URLs: presigned URLs expire, breaking
// inline <img src> rendering when the user leaves the page open, and
// a public bucket would expose PII (user-submitted bug reports) to
// anyone with the hash.
//
// Auth: any signed-in user is enough. Tighter checks (per-row
// ownership) would require joining key → row → owner, which is
// overkill — the keys are sha256 content-addressed so they're
// unguessable, and admins are the primary consumers.
//
// Path traversal + prefix guards are intentional defense-in-depth.

const MAX_KEY_SEGMENTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export type ScreenshotsHandlerDeps = {
  adapter: AuthAdapter;
  r2: R2Context;
};

export async function handleScreenshotGet(
  req: Request,
  segments: string[],
  deps: ScreenshotsHandlerDeps,
): Promise<Response> {
  const user = await deps.adapter.readSessionUser(req);
  if (!user) {
    return json({ error: "Sign in required." }, 401);
  }

  if (!Array.isArray(segments) || segments.length === 0 || segments.length > MAX_KEY_SEGMENTS) {
    return json({ error: "Invalid key." }, 400);
  }

  // Defensive: only serve keys under the screenshots/ prefix. Stops
  // the route from being used as a generic R2 reader.
  if (segments[0] !== "screenshots") {
    return json({ error: "Forbidden." }, 403);
  }

  // Path traversal guard. Keys we generate are sha-hex + ext so no
  // segment ever contains "..", but a hand-crafted URL could try.
  for (const seg of segments) {
    if (seg.includes("..") || seg.includes("/") || seg.includes("\\") || seg.length === 0) {
      return json({ error: "Invalid key." }, 400);
    }
  }

  const key = segments.map(decodeURIComponent).join("/");

  let obj;
  try {
    obj = await deps.r2.r2.send(new GetObjectCommand({ Bucket: deps.r2.bucket, Key: key }));
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === "NoSuchKey" || name === "NotFound") {
      return json({ error: "Not found." }, 404);
    }
    throw e;
  }

  if (!obj.Body) {
    return json({ error: "Empty body." }, 500);
  }

  const body = obj.Body as unknown as ReadableStream;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": obj.ContentType ?? "application/octet-stream",
      "Content-Length": String(obj.ContentLength ?? ""),
      "Cache-Control": "private, max-age=3600, immutable",
    },
  });
}
