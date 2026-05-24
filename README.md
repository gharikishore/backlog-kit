# @local/backlog-kit

Drop-in admin + bug-capture + triage system for any Next.js + Postgres app.
Floating "Bug · Feedback" widget, magic-link sign-in, `/admin` chrome,
full backlog dashboard with state machine + ship-gate + audit log,
plus the backing schema + migrations.

**v1.0.0** — full implementation, extracted from
[`gharikishore/specforge`](https://github.com/gharikishore/specforge)
and validated end-to-end on two consumers (specforge + hmbr-starter
dry-run).

## Heritage

This kit consolidates work originally extracted under two parallel
metas: feedback-triage (META #930, capture + triage) and admin-chassis
(META #964, sign-in + admin chrome). Per user direction (2026-05-24),
they ship as **one integrated package** — in practice nobody wants
capture without triage, triage without admin chrome, or admin chrome
without auth. The `createBacklog(config)` factory pattern from this
kit's original scaffolding spec is a future v2.0 refactor; v1.0 uses
direct exports + the AuthAdapter / BacklogUIAdapter context patterns
established during the feedback-triage extraction.

`gharikishore/feedback-triage` is deprecated as of 2026-05-24 —
consumers should use `@local/backlog-kit` directly.
`gharikishore/admin-chassis` scaffold repo is preserved as a name
reservation but is empty; its functionality lives here.

## What you get

| Layer | Provided |
|---|---|
| **Sign-in** | Magic-link `<SignInPage />` with configurable brand + endpoints + dev-mode quick-login |
| **Admin chrome** | `<AdminHeader />` top bar + `<AdminLayout />` wrapper |
| **Launchpad** | `<TileMenu />` Fiori-style tile menu for `/admin` landings — icon + label + hint + KPI stats per tile, flat or section-grouped layout, optional drag-to-reorder with per-device localStorage persistence (intake #983) |
| **Capture** | `<IntakeWidget />` floating pill + modal, `<ErrorReporter />` for window errors |
| **Shell** | `<ReviewCard />` 2-column layout with compact/expanded modes |
| **Theme** | 21 `--ft-*` CSS variables — recolor everything without code edits |
| **Schema** | Drizzle schemas + bundled SQL migrations: `intake_items` (sequence + auto-unblock trigger), `bug_reports`, `intake_item_comments`, `intake_item_attachments`, `intake_item_links`, `audit_log` (RANGE-partitioned), `agent_sessions`, `agent_session_activities`, `agent_session_dependencies`, `system_errors` |
| **Lib helpers** | `screenshot-r2.ts` (content-addressable R2 uploader), `audit.ts` (impersonation-aware audit log), `backlog-events.ts` (in-process SSE), `auth-adapter.ts` (consumer-supplied auth contract) |
| **API handlers** | Next-agnostic POST/GET/PATCH handlers for `/api/bugs`, `/api/intake`, `/api/admin/backlog/*`, `/api/screenshots/*` |
| **Admin UI** | 15 components: `BacklogCard`, `CommentsThread`, `HistoryTimeline`, `NoteEditor`, `BlockStrip`, `StateLozenge`, `AttachmentsStrip`, `LogicalNextStrip`, `RelatedStrip`, `BacklogViewsToolbar`, `PaginationBar`, `FilterChip`, `LinkifiedSeqText`, `NoteDisplay`, `ActionBtn` — wired via `<BacklogUIProvider>` kit adapter |
| **SQL migrations** | Single consolidated `migrations/0000_init.sql` + `scripts/apply-migrations.ts` runner |

## Peer dependencies

```json
{
  "next": "^15.0.0 || ^16.0.0",
  "react": "^18.0.0 || ^19.0.0",
  "react-dom": "^18.0.0 || ^19.0.0",
  "drizzle-orm": "^0.45.0",
  "postgres": "^3.4.0",
  "@aws-sdk/client-s3": "^3.0.0",
  "@aws-sdk/s3-request-presigner": "^3.0.0",
  "lucide-react": "^0.500.0",
  "html2canvas": "^1.4.1"
}
```

## Required env vars

| Variable | Purpose | Required for |
|---|---|---|
| `DATABASE_URL` | Postgres connection | Everything |
| `R2_*` (account id, access key, secret, endpoint, bucket) | Cloudflare R2 | Screenshot uploads |
| `CRON_SECRET` | Bearer for cron routes | If you wire `/api/cron/audit-log-*` |
| auth-backend env (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | Your sign-in flow | Magic-link `/signin` (consumer-supplied auth) |

## Quick start (10 steps)

### 1. Add the submodule

```bash
git submodule add https://github.com/gharikishore/backlog-kit.git .claude/kits/backlog
```

Pairs naturally with [`gharikishore/impersonation-kit`](https://github.com/gharikishore/impersonation-kit) — add that too if you need admin impersonation with audit auto-stamping.

### 2. Wire the path alias

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@local/backlog-kit": ["./.claude/kits/backlog/src/index.ts"],
      "@local/backlog-kit/*": ["./.claude/kits/backlog/src/*"]
    }
  }
}
```

### 3. Tell Tailwind about the submodule

```js
content: [
  "./src/**/*.{js,ts,jsx,tsx,mdx}",
  "./.claude/kits/backlog/src/**/*.{js,ts,jsx,tsx}",
],
```

### 4. Tell Turbopack to transpile

```js
// next.config.js
const nextConfig = {
  transpilePackages: ["@local/backlog-kit"],
};
```

### 5. Define the theme variables

Copy the `--ft-*` block from `.claude/kits/backlog/src/components/default-theme.css`
into your `globals.css` and tune to your brand.

### 6. Run the migrations

```bash
DATABASE_URL=postgres://... npx tsx .claude/kits/backlog/scripts/apply-migrations.ts
```

### 7. Mount the capture components

```tsx
// app/layout.tsx
import { ErrorReporter, IntakeWidget } from "@local/backlog-kit/components/capture";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ErrorReporter />
        <IntakeWidget />
        {children}
      </body>
    </html>
  );
}
```

### 8. Mount the sign-in + admin chrome

```tsx
// app/signin/page.tsx
import { SignInPage } from "@local/backlog-kit/signin";

export default function YourSignInPage() {
  return (
    <SignInPage
      brandName="YourApp"
      signinEndpoint="/api/auth/signin"
      devSigninEndpoint="/api/auth/dev-signin"  // optional, localhost-only
    />
  );
}
```

```tsx
// app/admin/layout.tsx
import { AdminHeader } from "@local/backlog-kit/components/admin-chrome";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminHeader
        brandName="YourApp"
        subtitleText="Operate the platform"
        meEndpoint="/api/me"
        logoutEndpoint="/api/logout"
        secondaryLink={{ href: "/docs", label: "Docs" }}
      />
      {children}
    </>
  );
}
```

`/api/me`, `/api/logout`, `/api/auth/signin`, `/api/auth/dev-signin`
are consumer-supplied — the kit only calls them. See specforge's
implementations as worked examples.

### 9. Mount the admin launchpad (optional)

The kit ships a Fiori-style tile menu for `/admin` landings. Drop
`<TileMenu />` in `app/admin/page.tsx` and feed it the surfaces you
want admins to reach:

```tsx
// app/admin/page.tsx
import { TileMenu, type Tile } from "@local/backlog-kit/components/launchpad";
import { ListChecks, UserCog, Layers } from "lucide-react";

const ICON_PROPS = { size: 40, strokeWidth: 1.5 } as const;

export default function AdminLanding() {
  const tiles: Tile[] = [
    {
      href: "/admin/backlog",
      iconElement: <ListChecks {...ICON_PROPS} />,
      label: "Backlog",
      hint: "Triage incoming bugs, feedback, and ideas.",
      stats: [
        { value: 8, label: "Pending" },
        { value: 4, label: "Accepted" },
        { value: 2, label: "Ready" },
      ],
    },
    {
      href: "/admin/impersonate",
      iconElement: <UserCog {...ICON_PROPS} />,
      label: "Impersonate",
      hint: "Act as another user — full role-gated view.",
    },
    {
      href: "/admin/sessions",
      iconElement: <Layers {...ICON_PROPS} />,
      label: "Sessions",
      hint: "Live state for each parallel Claude session.",
    },
  ];

  return (
    <TileMenu
      title="Admin"
      subtitle="Operate the platform. More tiles will appear here as surfaces grow."
      brandKicker="YourApp"
      tiles={tiles}
      orderKey="admin-tiles"
    />
  );
}
```

`stats` is optional — omit it for a pure launch tile. `orderKey`
enables drag-to-reorder + per-device persistence. For section-grouped
layouts (e.g. `/studio` landings with role-based groups), pass
`groups: TileGroup[]` instead of `tiles`.

### 10. Wire the API routes + admin/backlog page

Mount thin route shims that delegate to the package handlers. See
`docs/adoption.md` for the complete cookbook (or follow specforge's
`src/app/api/{bugs,intake,admin/backlog/*,screenshots}/route.ts`
files as the worked example).

The admin/backlog page mounts `<BacklogUIProvider value={kit}>` +
uses `BacklogCard` from `@local/backlog-kit/components/triage`.

## Auth-adapter contract

```ts
import type { AuthAdapter } from "@local/backlog-kit/lib/auth-adapter";

export const adapter: AuthAdapter = {
  readSessionUser: async (req) => {
    const session = await getMySession(req);
    if (!session) return null;
    return {
      id: session.userId,
      systemRole: session.role,   // "admin" gates admin routes
      label: session.email,
    };
  },
  getImpersonatorId: async () => null,  // wire when you have impersonation
};
```

Pairs naturally with [`gharikishore/impersonation-kit`](https://github.com/gharikishore/impersonation-kit):
specforge wires `getImpersonatorId` from impersonation-kit so audit
rows auto-stamp the real admin even during impersonation.

## Updating after upstream changes

```bash
# In the canonical repo:
git add . && git commit -m "feat: …" && git push

# In any consumer:
git -C .claude/kits/backlog fetch origin main
git -C .claude/kits/backlog checkout main
git -C .claude/kits/backlog pull
git add .claude/kits/backlog
git commit -m "bump backlog-kit submodule to <sha>"
```

Vercel deploys auto-clone submodules at build time.

## Validated consumers

| Project | Stack | Status | Notes |
|---|---|---|---|
| **specforge** | Next 16 + Drizzle + Supabase + R2 | Full integration | Source-of-truth extractor + smoke harnesses (capture: 8/8, chrome: 8/8) |
| **hmbr-starter** | Next 15 + Prisma + NextAuth | Dry-run import (7/7) | Submodule + tsconfig paths + Tailwind content + brand-themed `--ft-*` vars all wired on first try (validated 2026-05-24) |
| **hmbrimpact-site** | Static HTML/CSS/JS | Not applicable | Static site — out of scope for this kit |

## Repo layout

```
backlog-kit/
  README.md
  package.json                        # @local/backlog-kit
  tsconfig.json
  src/
    index.ts                          # barrel (schema + lib)
    schema/                           # Drizzle table defs
    lib/                              # screenshot R2, audit, backlog events, auth-adapter
    api/                              # framework-agnostic Response-returning handlers
    signin/                           # SignInPage (intake #967)
    components/
      default-theme.css               # 21 --ft-* CSS variables
      capture/                        # IntakeWidget, ErrorReporter
      triage/                         # ReviewCard, BacklogCard, CommentsThread, NoteEditor, BlockStrip, … (15 components) + BacklogUIAdapter context
      admin-chrome/                   # AdminHeader, AdminLayout (intake #968)
      launchpad/                      # TileMenu — Fiori-style tile grid (intake #983)
    types/                            # public TS types
  migrations/                         # 0000_init.sql (consolidated schema)
  scripts/                            # apply-migrations.ts runner
  docs/                               # adoption / migration / api
```

## Roadmap

| Status | What |
|---|---|
| ✅ | Schemas, lib, capture UI, ReviewCard shell, CSS-variable theming, capture API handlers, admin/backlog API handlers, admin/backlog UI primitives via KitAdapter, SQL migrations, magic-link sign-in (#967), admin chrome (#968), specforge validated (#970), Fiori-style launchpad tile menu (#983 — v1.1) |
| ⏳ | `createBacklog(config)` factory pattern refactor (spec direction from META #947 owner; v2.0) |
| ⏳ | API contract docs (`docs/api.md` refresh), adoption cookbook (`docs/adoption.md` refresh) |
| ⏳ | hmbr-starter dry-run refresh against backlog-kit (the original validation was against `gharikishore/feedback-triage` before the rename) |
