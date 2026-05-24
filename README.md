# @gharikishore/backlog-kit

Reusable backlog / intake-tracking library for Next.js + Drizzle apps. One admin (or team) files intakes, triages them through a state machine, and ships completed work via a deliberate ship-gate. Comments, META + child relationships, block-status tracking, audit-log integration, and SSE-driven UI refresh — all themable.

**Status:** v0.1.0 — **scaffolding only.** Implementation follows the spec in [`specforge:docs/backlog-kit-spec.md`](https://github.com/gharikishore/specforge/blob/main/docs/backlog-kit-spec.md) and is sliced across intakes #955-#961 of META #947 in the Specforge backlog.

**Canonical implementation reference:** [`gharikishore/specforge`](https://github.com/gharikishore/specforge) — the working app this kit was extracted from.

## Phase 2 progress

- [x] **#954 — Spec** ([`docs/backlog-kit-spec.md`](https://github.com/gharikishore/specforge/blob/main/docs/backlog-kit-spec.md) in Specforge)
- [x] **#955 — Scaffolding** ← this commit
- [ ] **#956 — Schema layer** (`createBacklogSchema` + `createBacklogSchemaMigrations`)
- [ ] **#957 — Core API** (`createBacklog` factory)
- [ ] **#958 — Route factories** (CRUD + ship + comments + SSE)
- [ ] **#959 — UI components** (the big lift: BacklogCard, NoteEditor, BlockStrip, CommentsThread, RelatedStrip, LogicalNextStrip, ReviewCard layout primitive, HistoryTimeline, theme provider)
- [ ] **#960 — Migrate Specforge** to consume the kit (coordinated with feedback-triage submodule from META #930)
- [ ] **#961 — Docs** (api.md / adoption.md / migration.md)

Until Phase 2 lands, this repo is **not consumable**. Use Specforge's inline backlog system directly.

## Why

Across multiple projects (Specforge, HmBr Impact, HmBr Store, future apps), backlog / intake / state-machine tracking has the same shape:
- File an intake (bug, feedback, idea, signup, etc.)
- Triage with reasoning
- Move through `pending → accepted → ready_to_ship → shipped` (plus declined / duplicate terminals)
- Ship-gate enforcement: explicit `ship_approved_at` stamp before commit
- META + child relationships for epic-style decomposition
- Block-status: `parked` / `blocked` until another ticket resolves
- Comments / discussion thread
- Audit-log integration

The kit packages this 80% as a reusable library + exposes the project-specific 20% (category/kind enums, schema names, UI theme, candidate filter) as configuration. Same pattern as [`@gharikishore/impersonation-kit`](https://github.com/gharikishore/impersonation-kit).

## Architecture (planned)

**Pluggable surfaces:**
- `tableNames` — your schema's intake / audit / comments table names
- `categories` + `kinds` — your enum vocabulary
- `sessionResolver` / `isAdmin` / `userById` — your auth model
- `auditWriter` — your audit-log helper (delegate to feedback-triage or whatever you have)
- `sessionContext` — optional session-tracking integration (for "via session X" attribution)
- `sseBroadcast` — your SSE plumbing
- `theme` — design tokens

**Fixed (the design):**
- Six-state machine: pending / accepted / ready_to_ship / shipped / declined / duplicate
- Ship-gate: `ship_approved_at` must be stamped before shipping
- META-child via `parent_intake_item_id` + `blocked_by_intake_item_id`
- Audit auto-stamp: every state change writes an audit row via consumer's `auditWriter`
- SSE: events fire on every server-side write; UI refreshes with `preserveOrder: true`

## Design history

Spec doc + design decisions: [`specforge:docs/backlog-kit-spec.md`](https://github.com/gharikishore/specforge/blob/main/docs/backlog-kit-spec.md). Read that first for the full contract.
