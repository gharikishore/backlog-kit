import { eq, desc } from "drizzle-orm";
import { intakeItems, intakeItemAttachments } from "../schema";
import { broadcastBacklogChange } from "../lib/backlog-events";
import {
  uploadScreenshotDataUrl,
  screenshotUrlForKey,
  type R2Context,
} from "../lib/screenshot-r2";
import type { AuthAdapter } from "../lib/auth-adapter";
import { requireAdmin, json } from "./_shared";

// /api/admin/backlog/[id]/attachments — admin-only image attachments
// on backlog tickets (specforge intake #197). Images only for v1
// (image/png, image/jpeg, image/gif, image/webp).
//
// Per intake #845: uploaded images go to R2 (sha256 content-addressed,
// dedup on identical content). The `data_url` column on
// intake_item_attachments stores the R2 KEY (not a data URL) — column
// name is a misnomer kept for backward compat. GET re-builds the
// proxy URL via /api/screenshots/<key>.

const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DATA_URL_LEN = (MAX_BYTES * 4) / 3 + 100;

export type AttachmentsHandlerDeps = {
  adapter: AuthAdapter;
  db: any;
  r2: R2Context;
};

export async function handleBacklogAttachmentsGet(
  req: Request,
  id: string,
  deps: AttachmentsHandlerDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;

  const rows = await deps.db
    .select({
      id: intakeItemAttachments.id,
      filename: intakeItemAttachments.filename,
      mimeType: intakeItemAttachments.mimeType,
      sizeBytes: intakeItemAttachments.sizeBytes,
      dataUrl: intakeItemAttachments.dataUrl,
      caption: intakeItemAttachments.caption,
      createdAt: intakeItemAttachments.createdAt,
    })
    .from(intakeItemAttachments)
    .where(eq(intakeItemAttachments.intakeItemId, id))
    .orderBy(desc(intakeItemAttachments.createdAt));

  // R2 keys → proxy URLs. Legacy base64 rows pass through.
  const items = rows.map((r: any) => ({
    ...r,
    dataUrl:
      r.dataUrl && r.dataUrl.startsWith("screenshots/")
        ? screenshotUrlForKey(r.dataUrl)
        : r.dataUrl,
  }));

  return json({ items });
}

export async function handleBacklogAttachmentPost(
  req: Request,
  id: string,
  deps: AttachmentsHandlerDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;
  const adminUser = auth;

  let body: { filename?: string; mimeType?: string; dataUrl?: string; caption?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (typeof body.filename !== "string" || body.filename.trim().length === 0) {
    return json({ error: "filename required." }, 400);
  }
  if (typeof body.mimeType !== "string" || !ALLOWED_MIMES.has(body.mimeType)) {
    return json(
      { error: `mimeType must be one of: ${[...ALLOWED_MIMES].join(", ")}` },
      400,
    );
  }
  if (
    typeof body.dataUrl !== "string" ||
    !body.dataUrl.startsWith("data:" + body.mimeType + ";base64,")
  ) {
    return json(
      { error: "dataUrl must be a base64 data URL whose MIME matches the mimeType field." },
      400,
    );
  }
  if (body.dataUrl.length > MAX_DATA_URL_LEN) {
    return json({ error: "Attachment exceeds the 5 MB cap." }, 413);
  }

  // Defensive parent-exists check (FK would 500 otherwise).
  const [parent] = await deps.db
    .select({ id: intakeItems.id })
    .from(intakeItems)
    .where(eq(intakeItems.id, id))
    .limit(1);
  if (!parent) return json({ error: "Not found." }, 404);

  const ref = await uploadScreenshotDataUrl(body.dataUrl, deps.r2);
  if (!ref) {
    return json({ error: "Could not parse the data URL as a supported image." }, 400);
  }

  const [row] = await deps.db
    .insert(intakeItemAttachments)
    .values({
      intakeItemId: id,
      uploadedByUserId: adminUser.id,
      filename: body.filename.trim().slice(0, 200),
      mimeType: body.mimeType,
      sizeBytes: ref.sizeBytes,
      dataUrl: ref.key, // intake #845 — store R2 key, not data URL
      caption:
        typeof body.caption === "string" ? body.caption.trim().slice(0, 500) : null,
    })
    .returning({
      id: intakeItemAttachments.id,
      filename: intakeItemAttachments.filename,
      mimeType: intakeItemAttachments.mimeType,
      sizeBytes: intakeItemAttachments.sizeBytes,
      caption: intakeItemAttachments.caption,
      createdAt: intakeItemAttachments.createdAt,
    });

  broadcastBacklogChange("intake.attachment_added");
  return json({ ok: true, attachment: { ...row, dataUrl: ref.url } });
}

export async function handleBacklogAttachmentDelete(
  req: Request,
  id: string,
  deps: AttachmentsHandlerDeps,
): Promise<Response> {
  const auth = await requireAdmin(req, deps.adapter);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const attachmentId = url.searchParams.get("attachmentId");
  if (!attachmentId) return json({ error: "attachmentId required." }, 400);

  const [row] = await deps.db
    .select()
    .from(intakeItemAttachments)
    .where(eq(intakeItemAttachments.id, attachmentId))
    .limit(1);
  if (!row) return json({ error: "Attachment not found." }, 404);
  if (row.intakeItemId !== id) {
    return json({ error: "Attachment does not belong to this item." }, 403);
  }
  await deps.db
    .delete(intakeItemAttachments)
    .where(eq(intakeItemAttachments.id, attachmentId));
  broadcastBacklogChange("intake.attachment_removed");
  return json({ ok: true });
}
