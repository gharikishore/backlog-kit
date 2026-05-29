// Framework-agnostic API handlers. Each export is a `(req, deps) =>
// Promise<Response>` function. Consumers wrap them with their own
// route.ts (Next.js App Router) or equivalent route shells.
//
// Capture-side handlers (intake #972):
//   - handleBugPost            POST /api/bugs       — anyone, drops a bug_reports row
//   - handleIntakePost         POST /api/intake     — signed-in, drops an intake_items row (mirrors to bug_reports for kind=bug)
//   - handleScreenshotGet      GET  /api/screenshots/<key>  — signed-in, streams from R2
//
// Admin-side handlers (intake #974):
//   - handleBacklogList                GET    /api/admin/backlog            — list + filter + sort + page (raw rows; consumer enriches user labels)
//   - handleBacklogEventsGet           GET    /api/admin/backlog/events     — SSE stream of changes
//   - handleBacklogItemPatch           PATCH  /api/admin/backlog/[id]       — state machine + audit + cascade
//   - handleBacklogAttachmentsGet      GET    /api/admin/backlog/[id]/attachments
//   - handleBacklogAttachmentPost      POST   /api/admin/backlog/[id]/attachments
//   - handleBacklogAttachmentDelete    DELETE /api/admin/backlog/[id]/attachments?attachmentId=…
export * from "./bugs";
export * from "./intake";
export * from "./screenshots";
export * from "./admin-backlog-list";
export * from "./admin-backlog-events";
export * from "./admin-backlog-item";
export * from "./admin-backlog-attachments";
export * from "./admin-backlog-watchers";
