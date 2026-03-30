# AGENTS.md — BrainHeal

Guidance for agentic coding assistants working in this repository.

---

## Project Status

Implementation is complete (Phases 0.1–11). See `IMPLEMENTATION_PLAN.md` for full status.

### Specification Documents

All specs live under `specs/`. See [`specs/README.md`](specs/README.md) for the full index.

---

## Repository Layout

```
brainheal/
├── deno.json                   # workspace root — shared deps + root tasks
├── deno.lock
├── compose.yaml                # Docker Compose: worker + frontend
├── README.md
├── packages/
│   └── shared/                 # @brainheal/shared — types, constants, utilities
│       ├── mod.ts              # package entry point (re-exports from src/)
│       ├── src/
│       │   ├── types.ts
│       │   └── types_test.ts
│       └── deno.json
├── frontend/                   # @brainheal/frontend — React + Vite PWA (Deno runtime)
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── lib/                # Supabase client, helpers
│   │   └── types/
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── Dockerfile              # multi-stage: Deno build → nginx serve
│   ├── nginx.conf
│   └── deno.json
├── supabase/
│   ├── functions/              # Edge Functions — each is a workspace member
│   │   ├── ingest/             # @brainheal/fn-ingest
│   │   │   ├── index.ts        # thin shim: imports app from src/, calls Deno.serve
│   │   │   └── src/
│   │   │       ├── index.ts    # Hono app + all route logic
│   │   │       └── index_test.ts
│   │   └── stripe-webhook/     # @brainheal/fn-stripe-webhook
│   │       ├── index.ts        # thin shim
│   │       └── src/
│   │           └── index.ts    # Hono app + all route logic
│   └── migrations/             # SQL migration files
├── worker/                     # @brainheal/worker — Fly.io processing worker
│   ├── src/
│   │   ├── main.ts
│   │   ├── processor.ts
│   │   ├── llm.ts
│   │   ├── fetcher.ts
│   │   ├── budget.ts
│   │   ├── budget_test.ts
│   │   ├── fetcher_test.ts
│   │   └── llm_test.ts
│   ├── Dockerfile
│   ├── fly.toml
│   └── deno.json
└── extension/                  # @brainheal/extension — Chrome MV3 (Phase 2, not yet implemented)
```

### `src/` Convention

- All TypeScript source lives in a `src/` subdirectory within each workspace.
- **Edge Functions**: Supabase requires `index.ts` at the function root. The root `index.ts` is a thin shim that imports the Hono `app` from `src/index.ts` and calls `Deno.serve(app.fetch)`. All logic lives in `src/`.
- **Frontend**: Already follows `src/` layout (not changed).
- **packages/shared**: `mod.ts` at root re-exports from `src/types.ts`.

---

## Project Conventions

Rules for agents and contributors. Every rule here must be followed when adding or modifying workspaces.

### 1. TypeScript source in `src/`

- All TypeScript source files must live in a `src/` subdirectory inside each workspace. Non-TS files (`deno.json`, `Dockerfile`, `fly.toml`, config files) stay at the workspace root.
- **Edge Functions** are the one exception to the flat-root rule: Supabase requires `index.ts` at the function root. Keep it as a thin shim (`import { app } from './src/index.ts'; Deno.serve(app.fetch)`). All logic goes in `src/`.
- **Frontend** already follows the `src/` layout — do not move it.
- **`packages/shared`**: `mod.ts` stays at root (it is the package entry point); all source goes in `src/`.

### 2. `.env.example` for every runnable workspace

- Every workspace that can be **run** (i.e. has a `dev` or `start` task, or is deployed) must have a `.env.example` at its workspace root.
- The file must be **ready to copy as-is to `.env`** for local development — meaning all values that have known local defaults (e.g. local Supabase URL and well-known dev keys) are pre-filled. Only genuine secrets that differ per developer (e.g. `LLM_API_KEY`, `STRIPE_WEBHOOK_SECRET`) may be left as commented-out placeholders.
- Never commit `.env` files. They are gitignored. Only `.env.example` is committed.
- The `service_role` key and other Supabase local dev keys are not secrets — they are the same for every developer's local stack and may appear in `.env.example`.

### 3. `README.md` for every workspace

- Every workspace must have a `README.md` at its workspace root.
- Required sections:
  1. One-sentence description of what the service does.
  2. **Dependencies** — list any other services that must be running first (assume they run via Docker Compose or `deno task supabase:start`).
  3. **Environment setup** — `cp .env.example .env` and any secrets that need filling in.
  4. **How to run** — the command(s) to start the service locally.
  5. **How to run tests** (if the workspace has tests).
- Keep READMEs short. Do not duplicate information already in `specs/`.

### 4. Docker Compose for runnable services

- Any service that can run in a container must be declared in the root `compose.yaml`.
- The `start` / `stop` root deno tasks must start/stop the full local stack in one command.
- Supabase is managed via the Supabase CLI (`supabase start`), not Docker Compose. It is started by `deno task supabase:start`, which is chained into `deno task start`.
- Docker build contexts must be the repo root (not the service subdirectory) so that shared files (`deno.json`, `packages/shared/`) are accessible.
- Do not copy `deno.lock` into Docker images — the lockfile version may not match the Deno version in the image.

### 5. Deno task naming

- Root-level tasks must follow the `scope:action` format.
- Established scopes:
  - `docker:` — Docker Compose operations (`docker:start`, `docker:stop`, `docker:build`, `docker:logs`)
  - `supabase:` — Supabase CLI operations (`supabase:start`, `supabase:stop`, `supabase:status`, `supabase:migrate`)
  - `fn:` — Edge Function local serving (`fn:ingest`, `fn:stripe-webhook`)
- Top-level convenience tasks (`start`, `stop`) are allowed when they compose multiple scoped tasks.
- Workspace-local tasks (defined inside a member's `deno.json`) use simple names (`dev`, `start`, `build`, `preview`) and are invoked from the root as `deno task --cwd=<member> <task>`.

---

## Build / Lint / Test Commands

**Runtime:** Deno 2.7 everywhere — no Node.js, no npm. HTTP framework: Hono (all members).

### Root tasks (run from repo root)

```bash
# Install / sync dependencies
deno install

# Run all tests across every workspace member
deno test --allow-all

# Run tests in a single member directory
deno test --allow-all worker/

# Run a single test file
deno test --allow-all worker/src/budget_test.ts

# Run tests matching a name pattern
deno test --filter "checkDailyBudget"

# Type-check all members
deno check **/*.ts

# Lint everything
deno lint

# Format everything
deno fmt
```

### Full stack lifecycle

```bash
deno task start            # supabase:start + docker:start (all services)
deno task stop             # docker:stop + supabase:stop

deno task docker:start     # docker compose up -d --build
deno task docker:stop      # docker compose down
deno task docker:build     # docker compose build (no start)
deno task docker:logs      # tail Docker Compose logs

deno task supabase:start   # supabase start
deno task supabase:stop    # supabase stop
deno task supabase:status  # supabase status (shows URLs + keys)
deno task supabase:migrate # supabase db push (apply migrations)
```

### Edge Functions (local dev)

```bash
deno task fn:ingest          # supabase functions serve ingest
deno task fn:stripe-webhook  # supabase functions serve stripe-webhook
```

### Individual services

```bash
deno task --cwd=frontend dev      # Vite dev server (port 3000)
deno task --cwd=frontend build    # Production build → frontend/dist/
deno task --cwd=frontend preview  # Preview production build

deno task --cwd=worker dev    # Run worker locally with --watch
deno task --cwd=worker start  # Run worker (production mode)
```

### Supabase CLI (direct)

```bash
# Deploy an Edge Function
supabase functions deploy ingest
supabase functions deploy stripe-webhook
```

---

## Code Style Guidelines

### TypeScript (Frontend + Deno)

- **Target**: `ES2022` (frontend), `ESNext` (Deno)
- **Strict mode**: always — `"strict": true` in every `tsconfig.json`
- **No `any`**: avoid `any`; use `unknown` and narrow with type guards
- **No non-null assertion** (`!`): use optional chaining (`?.`) or explicit null checks
- **Explicit return types** on all exported functions
- **Prefer `type` over `interface`** for object shapes unless extension/merging is needed
- **Enums**: avoid string enums; use `as const` union types instead:
  ```typescript
  // Preferred
  type CardType = 'text' | 'image' | 'key_points' | 'quote';
  // Avoid
  enum CardType { Text = 'text', ... }
  ```

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files (frontend) | `kebab-case` | `feed-item.tsx`, `use-feed.ts` |
| Files (Deno) | `snake_case` | `queue_processor.ts` |
| React components | `PascalCase` | `FeedCard`, `QueueView` |
| Hooks | `camelCase` prefixed with `use` | `useFeed`, `useAuth` |
| Types / interfaces | `PascalCase` | `FeedItem`, `QueueStatus` |
| Variables / functions | `camelCase` | `feedItems`, `snoozeFeedItem` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_CARDS_PER_POST` |
| DB columns / tables | `snake_case` | `feed_items`, `post_id` |
| Edge Functions | `kebab-case` dirs | `supabase/functions/ingest/` |
| SQL functions | `snake_case` | `snooze_feed_item`, `mark_feed_item_read` |

### Imports

**Frontend (TypeScript/ESM):**
```typescript
// 1. External packages first
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

// 2. Internal absolute imports (path aliases preferred)
import { supabase } from '@/lib/supabase';
import type { FeedItem } from '@/types';

// 3. Relative imports last
import { CardView } from './CardView';
```

**Deno:**
```typescript
// Use JSR or npm specifiers with import maps in deno.json; never raw https:// URLs
import { assertEquals } from '@std/assert';
import { Hono } from 'hono';
```

- No default exports from utility/helper modules — use named exports
- React components may use default exports

### Formatting

- **Indentation**: 2 spaces (no tabs)
- **Quotes**: single quotes (`'`) in TypeScript; double quotes in JSX attributes
- **Semicolons**: always
- **Trailing commas**: `'all'` (ES5+)
- **Max line length**: 100 characters
- **Prettier** for frontend; `deno fmt` for Deno code

### React Conventions

- **Functional components only** — no class components
- **Hooks for all state and side effects** — no direct DOM manipulation
- **Co-locate** component, its styles, and its tests in the same directory
- Keep components small; extract logic into custom hooks
- Use `React.FC` sparingly; prefer explicit prop type annotations:
  ```typescript
  type FeedCardProps = { item: FeedItem; onSnooze: () => void };
  export function FeedCard({ item, onSnooze }: FeedCardProps) { ... }
  ```

### Error Handling

**Supabase SDK pattern** — always destructure and check `error`:
```typescript
const { data, error } = await supabase.from('feed_items').select('*');
if (error) {
  // handle or rethrow — never silently ignore
  console.error('feed fetch failed', error);
  throw error;
}
```

**Deno / Edge Functions** — use `try/catch` for external calls (LLM, fetch):
```typescript
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (err) {
  // log structured JSON; update queue_item status to 'failed'
}
```

- Never `catch` and swallow errors silently
- Log with structured JSON in the Fly.io worker: `{ level, message, queue_item_id, ... }`
- Edge Functions return typed error responses: `{ error: string }` with appropriate HTTP status

### Database / Supabase Patterns

Always use the correct access layer:
- **Reads / simple writes** → `supabase.from()`
- **Atomic / transactional ops** → `supabase.rpc()`
- **Business logic + external calls** → `supabase.functions.invoke()`
- **Auth** → `supabase.auth.*`
- **Push updates** → `supabase.channel().on()`

RLS must be enabled on every `public` table. Never disable RLS to work around a query problem — fix the policy instead.

### SQL / Migrations

- Migration files: `supabase/migrations/<timestamp>_<description>.sql`
- All Postgres functions: `SECURITY DEFINER` + explicit `auth.uid()` check where needed
- Use `snake_case` for all identifiers
- Include `ROLLBACK` or down-migration comments for destructive changes

---

## Security Rules

- **Never commit secrets** — use `.env` (gitignored) for local secrets; `.env.example` documents the required variables
- The `service_role` key must only appear in the worker and Edge Function environments, never in frontend code
- The `anon` key is safe to embed in frontend (combined with RLS)
- Sanitize all user-supplied URLs and text in Edge Functions before processing
- Validate JWT in every Edge Function via `supabase.auth.getUser()` (SDK does this automatically when using `createClient` with the request's Authorization header)
