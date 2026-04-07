# AGENTS.md — BrainHeal

Guidance for agentic coding assistants working in this repository.

---

## Project Status

Implementation is complete (Phases 0.1–11). See `IMPLEMENTATION_PLAN.md` for full status.

### Specification Documents

All specs live under `specs/`. See [`specs/README.md`](specs/README.md) for the full index.

---

## Repository Layout

The high-level layout is following:

```
brainheal/
├── deno.json                   # workspace root — shared deps + root tasks
├── deno.lock
├── compose.yaml                # Docker Compose: worker + frontend
├── README.md
├── frontend/                   # @brainheal/frontend — React + Vite PWA (Deno runtime)
├── supabase/
│   ├── functions/              # Edge Functions — each is a workspace member
│   └── migrations/             # SQL migration files
├── worker/                     # @brainheal/worker — Fly.io processing worker
└── extension/                  # @brainheal/extension — Chrome MV3 (Phase 2, not yet implemented)
```

For the detailed structure see: `.cursor/rules/repo-structure.mdc`

### `src/` Convention

- All TypeScript source lives in a `src/` subdirectory within each workspace.
- **Edge Functions**: Supabase requires `index.ts` at the function root. The root `index.ts` is a thin shim that imports the Hono `app` from `src/index.ts` and calls `Deno.serve(app.fetch)`. All logic lives in `src/`.
- **Frontend**: Already follows `src/` layout (not changed).
- **Shared libraries** (`supabase/functions/_*`): `mod.ts` at root re-exports from `src/*.ts`.

---

## Project Conventions

Detailed rules live in `.cursor/rules/` and apply to all AI assistants (Cursor, OpenCode, etc.):

| Rule file | Covers |
|---|---|
| `.cursor/rules/workspace-conventions.mdc` | Folder structure, `src/` layout, `README.md` requirements |
| `.cursor/rules/env-example.mdc` | `.env.example` — what it must contain, local defaults |
| `.cursor/rules/docker-compose.mdc` | `compose.yaml` setup, Dockerfile build context rules |
| `.cursor/rules/deno-tasks.mdc` | Root task naming (`scope:action` format) |

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
| Source files | `kebab-case` | `queue-consumer.ts`, `feed-item.tsx` |
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
- **Semicolons**: none (configured in root `deno.json` with `"semiColons": false`)
- **Max line length**: 120 characters
- **`deno fmt`** for all code (Deno, Edge Functions, worker); frontend uses same settings via `deno.json`

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
