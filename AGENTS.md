# AGENTS.md — BrainHeal

Guidance for agentic coding assistants working in this repository.

---

## Project Status

This project is in the **specification phase**. No source code exists yet.

### Specification Documents

The monolithic `spec.md` has been split into focused files under `specs/`. See [`specs/README.md`](specs/README.md) for the full index.

Additional context: `spec-draft.md` (earlier draft), `CLAUDE.md` (Claude-specific guidance).

---

## Repository Layout (Planned)

```
brainheal/
├── deno.json                   # workspace root — shared deps + root tasks
├── deno.lock
├── packages/
│   └── shared/                 # @brainheal/shared — types, constants, utilities
│       └── deno.json
├── frontend/                   # @brainheal/frontend — React + Vite PWA (Deno runtime)
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── lib/                # Supabase client, helpers
│   │   └── api/                # Hono API server (dev proxy target)
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   └── deno.json
├── supabase/
│   ├── functions/              # Edge Functions — each is a workspace member
│   │   ├── ingest/             # @brainheal/fn-ingest
│   │   └── stripe-webhook/     # @brainheal/fn-stripe-webhook
│   └── migrations/             # SQL migration files
├── worker/                     # @brainheal/worker — Fly.io processing worker
│   ├── main.ts
│   ├── processor.ts
│   ├── llm.ts
│   └── deno.json
└── extension/                  # @brainheal/extension — Chrome MV3 (Phase 2)
    └── deno.json
```

---

## Build / Lint / Test Commands

**Runtime:** Deno 2.7 everywhere — no Node.js, no npm. HTTP framework: Hono (all members).

### All workspace members (run from repo root)

```bash
# Install / sync dependencies
deno install

# Run all tests across every workspace member
deno test --allow-all

# Run tests in a single member directory
deno test --allow-all worker/

# Run a single test file
deno test --allow-all worker/processor.test.ts

# Run tests matching a name pattern
deno test --filter "snooze_feed_item"

# Type-check all members
deno check

# Lint everything
deno lint

# Format everything
deno fmt
```

### Frontend (React + Vite, Deno runtime)

```bash
deno task --cwd=frontend dev      # Vite dev server (port 3000) + Hono API (port 8000)
deno task --cwd=frontend build    # Production build (output → frontend/dist/)
deno task --cwd=frontend preview  # Preview production build
```

### Worker (Fly.io)

```bash
deno task --cwd=worker dev    # Run worker locally with --watch
deno task --cwd=worker start  # Run worker (production mode)
```

### Supabase

```bash
# Start local Supabase stack
supabase start

# Apply migrations
supabase db push

# Run an Edge Function locally
supabase functions serve ingest --env-file .env.local

# Deploy an Edge Function
supabase functions deploy ingest
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

- **Never commit secrets** — use `.env.local` (gitignored) for local secrets
- The `service_role` key must only appear in the Fly.io worker environment, never in frontend code
- The `anon` key is safe to embed in frontend (combined with RLS)
- Sanitize all user-supplied URLs and text in Edge Functions before processing
- Validate JWT in every Edge Function via `supabase.auth.getUser()` (SDK does this automatically when using `createClient` with the request's Authorization header)
