import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

// R2-backed screenshot storage (specforge intake #845, META #88).
// Replaces base64-in-jsonb storage with content-addressable R2 objects
// served via /api/screenshots.
//
// Design:
//   - SHA-256 content hash → key = `screenshots/<hh>/<sha256>.<ext>`
//     (sharded by first 2 hex chars to avoid hot-prefix on R2)
//   - HeadObject before PutObject → idempotent, same image = same key,
//     never re-uploads. Three users hitting the same broken page get
//     ONE R2 object.
//   - All metadata returned (size, mime, sha) so callers can store it
//     alongside the key — no need to re-fetch to know size for UI.
//
// Storage shape on the row (in jsonb context):
//   context.screenshotKey:    "screenshots/ab/abc123…f9.png"
//   context.screenshotUrl:    "/api/screenshots/screenshots/ab/abc123…f9.png"
//   context.screenshotMime:   "image/png"
//   context.screenshotSize:   124_532
//   context.screenshotSha256: "abc123…f9"
//
// Shared-package note: takes the R2 client + bucket via the
// `R2Context` parameter so the package doesn't read env vars itself.
// Each consumer constructs its own `R2Context` from its own env.

export type R2Context = {
  /** S3-compatible client (R2, AWS S3, MinIO, etc.). */
  r2: Pick<S3Client, "send">;
  /** Bucket name to write to. */
  bucket: string;
};

const ALLOWED_SCREENSHOT_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export type ScreenshotRef = {
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  alreadyExisted: boolean;
};

type ParsedDataUrl = { mimeType: string; buffer: Buffer };

function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_SCREENSHOT_MIMES.has(mimeType)) return null;
  try {
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length === 0) return null;
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

/** Canonical R2 key — sha + ext, sharded by first 2 hex chars of sha. */
export function screenshotKeyFor(sha256: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType] ?? "bin";
  const shard = sha256.slice(0, 2);
  return `screenshots/${shard}/${sha256}.${ext}`;
}

/** App-relative URL the browser hits to render an R2-stored screenshot. */
export function screenshotUrlForKey(key: string): string {
  return `/api/screenshots/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Upload a base64 data URL to R2 (idempotent via content hash).
 * Returns null when the input isn't a recognised image data URL.
 */
export async function uploadScreenshotDataUrl(
  dataUrl: string,
  ctx: R2Context,
): Promise<ScreenshotRef | null> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const sha256 = createHash("sha256").update(parsed.buffer).digest("hex");
  const key = screenshotKeyFor(sha256, parsed.mimeType);

  let alreadyExisted = false;
  try {
    await ctx.r2.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: key }));
    alreadyExisted = true;
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    const httpStatusCode = (e as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
    if (name !== "NotFound" && httpStatusCode !== 404) throw e;
  }

  if (!alreadyExisted) {
    await ctx.r2.send(
      new PutObjectCommand({
        Bucket: ctx.bucket,
        Key: key,
        Body: parsed.buffer,
        ContentType: parsed.mimeType,
        ContentLength: parsed.buffer.length,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  return {
    key,
    url: screenshotUrlForKey(key),
    mimeType: parsed.mimeType,
    sizeBytes: parsed.buffer.length,
    sha256,
    alreadyExisted,
  };
}

/** Strip dataUrl, merge R2 ref into a context jsonb. Pure. */
export function mergeScreenshotRefIntoContext(
  ctx: Record<string, unknown> | null | undefined,
  ref: ScreenshotRef,
): Record<string, unknown> {
  const base = { ...(ctx ?? {}) };
  delete base.screenshotDataUrl;
  return {
    ...base,
    screenshotKey: ref.key,
    screenshotUrl: ref.url,
    screenshotMime: ref.mimeType,
    screenshotSize: ref.sizeBytes,
    screenshotSha256: ref.sha256,
  };
}
