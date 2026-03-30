# BrainHeal — MVP Implementation Plan

**Scope**: Mobile-first PWA backed by Supabase + Fly.io worker.  
**Key decisions**: LLM provider abstracted behind interface (env-var selected), frontend on Netlify, Google OAuth included from day one.

---

## Implementation Status — Updated 2026-03-29

**Tests passing:** 71/71 (packages/shared: 24, ingest Edge Function: 24, worker: 23)

**Completed phases:** 0.1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 (partial — nav + all pages implemented; PWA manifest done)

**Key learnings:**
- Vite build command: `deno task --cwd=frontend build`
- `deno install` from repo root syncs all workspace npm packages into `deno.lock`
- `nodeModulesDir: "auto"` must be set in the **root** `deno.json` — required for Vite to resolve npm packages. Run `deno install` after adding.
- The `@deno/vite-plugin` conflicts with `@supabase/supabase-js` — use plain `@vitejs/plugin-react` with `optimizeDeps.include` instead
- Deno LSP reports false positives for npm packages in tsx files (CSS modules, React types, etc.) — these are LSP-only and do not affect the Vite build
- The `@/` path alias works via Vite `resolve.alias` + `tsconfig.json` `paths` — Deno LSP does not resolve it but Vite does correctly
- `vite-plugin-pwa` with `manifest: false` uses `public/manifest.json` directly; PWA service worker is auto-generated
- `react-swipeable` v7 uses `useSwipeable` hook with `preventScrollOnSwipe: true` for card swipe gestures
- `AuthGuard` uses `Outlet` pattern (layout route) — use `<Route element={<AuthGuard />}>` with child routes nested inside; `AppShell` adds BottomNav wrapper

**Next up:** Phase 12 (PWA polish + production deployment) — icons, service worker configuration, deploy to Netlify/Supabase/Fly.io.

---

## How to read this plan

Tasks are grouped into phases. Each phase has a goal milestone. Work is broadly sequential within a phase, but tasks within a phase that have no dependencies can be done in parallel.

Progress tracking legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Repository & Infrastructure Bootstrap

**Goal**: Local toolchain ready, Supabase project running, Fly.io app created, all secrets in place.

### 0.1 Workspace skeleton

- [x] Create root `deno.json` (workspace array, shared imports: `hono`, `@supabase/supabase-js`, `@std/assert`)
- [x] Create `deno.lock`
- [x] Add `.gitignore` (`.env*`, `dist/`, `node_modules/`, `.DS_Store`)
- [x] Create `packages/shared/deno.json` (name: `@brainheal/shared`)
- [x] Create `packages/shared/mod.ts` (barrel export — re-exports from `types.ts`)

### 0.2 Supabase project

- [x] Install Supabase CLI (`brew install supabase/tap/supabase`)
- [x] `supabase init` — creates `supabase/` directory with `config.toml`
- [ ] Configure `supabase/config.toml`:
  - Enable email auth
  - Enable Google OAuth (client ID + secret via `.env.local`)
  - Enable Realtime on tables: `feed_items`, `queue_items`
- [ ] `supabase start` — spin up local Supabase stack
- [ ] Create `.env.local` with:
  ```
  SUPABASE_URL=
  SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  ```

### 0.3 Fly.io setup

- [x] Install `flyctl` (`brew install flyctl`)
- [x] `fly auth login`
- [ ] `fly launch --name brainheal-worker --no-deploy` inside `worker/` — generates `fly.toml`
- [ ] Configure secrets on Fly.io app:
  ```
  fly secrets set SUPABASE_URL=...
  fly secrets set SUPABASE_SERVICE_ROLE_KEY=...
  fly secrets set LLM_PROVIDER=openai   # or 'anthropic'
  fly secrets set LLM_API_KEY=...
  ```

### 0.4 Netlify setup

- [ ] Create Netlify site (via CLI: `netlify init` in `frontend/`)
- [ ] Add environment variables in Netlify dashboard:
  ```
  VITE_SUPABASE_URL=
  VITE_SUPABASE_ANON_KEY=
  ```
- [ ] Configure `netlify.toml` — publish dir `frontend/dist`, build command `deno task build`

---

## Phase 1 — Database Schema & Migrations

**Goal**: All tables, triggers, RLS policies, and RPC functions exist in the local Supabase stack and are reproducible via migrations.

### 1.1 Core tables migration

File: `supabase/migrations/<timestamp>_initial_schema.sql`

- [x] Create `profiles` table (id, nickname, billing_tier, created_at, updated_at)
- [x] Create `posts` table (id, user_id, source_url, source_text, title, status, error_message, created_at, updated_at)
- [x] Create `cards` table (id, post_id, position, content_type, text_content, media_url, media_caption, created_at)
- [x] Create `feed_items` table (id, user_id, post_id, queue_item_id, position, state, source_type, shared_by_user_id, shared_message, created_at, read_at)
- [x] Create `queue_items` table (id, user_id, input_type, input_value, status, error_message, retry_count, created_at, started_at, completed_at)
- [x] Create `cost_records` table (id, user_id, queue_item_id, tokens_input, tokens_output, cost_usd, model_used, created_at)
- [x] Create `favorite_groups` table (id, user_id, name, position, is_default, created_at)
- [x] Create `favorites` table (id, user_id, post_id, group_id, created_at)
- [x] Create `reactions` table (id, user_id, post_id, type, created_at)
- [x] Add indices: `feed_items(user_id, state, position)`, `queue_items(status, created_at)`, `favorites(user_id, post_id)`

### 1.2 Triggers migration

File: `supabase/migrations/<timestamp>_triggers.sql`

- [x] `handle_new_user()` — auto-insert `profiles` row on `auth.users` INSERT
- [x] `on_auth_user_created` trigger on `auth.users`
- [x] `handle_new_profile()` — auto-insert default "Saved" `favorite_groups` row on `profiles` INSERT
- [x] `on_profile_created` trigger on `profiles`

### 1.3 RLS policies migration

File: `supabase/migrations/<timestamp>_rls.sql`

- [x] Enable RLS on all `public` tables
- [x] `profiles`: SELECT/UPDATE own row only
- [x] `posts`: SELECT own posts; DELETE own posts
- [x] `cards`: SELECT cards of own posts
- [x] `feed_items`: SELECT/UPDATE/DELETE own items
- [x] `queue_items`: SELECT own items; DELETE own pending items
- [x] `favorite_groups`: SELECT/INSERT/UPDATE own groups; DELETE own non-default groups
- [x] `favorites`: SELECT/INSERT/DELETE own favorites
- [x] `reactions`: SELECT/INSERT/UPDATE/DELETE own reactions
- [x] `cost_records`: SELECT own records

### 1.4 RPC functions migration

File: `supabase/migrations/<timestamp>_rpc_functions.sql`

- [x] `snooze_feed_item(item_id uuid)` — UPDATE position to `MAX(position)+1` for auth.uid()
- [x] `mark_feed_item_read(item_id uuid)` — UPDATE state='read', read_at=now() for auth.uid()
- [x] `claim_next_queue_item()` — Worker RPC: atomically claims next pending item with FOR UPDATE SKIP LOCKED

### 1.5 Verify schema

- [ ] `supabase db push` (or `supabase migration up`) applies all migrations cleanly
- [ ] Manually verify tables, triggers, and policies in Supabase Dashboard (or `supabase studio`)

---

## Phase 2 — Shared Types Package

**Goal**: A single `@brainheal/shared` package exports all TypeScript types used across frontend, worker, and Edge Functions.

- [x] Define `CardType` union type: `'text' | 'image' | 'key_points' | 'quote'`
- [x] Define `PostStatus` union type: `'processing' | 'ready' | 'failed'`
- [x] Define `QueueStatus` union type: `'pending' | 'processing' | 'completed' | 'failed'`
- [x] Define `FeedItemState` union type: `'unread' | 'read'`
- [x] Define `BillingTier` union type: `'free' | 'paid'`
- [x] Define `SourceType` union type: `'self' | 'shared' | 'suggested'`
- [x] Define `InputType` union type: `'url' | 'text'`
- [x] Define `ReactionType` union type: `'like' | 'meh'`
- [x] Define `Profile` type (matching `profiles` table)
- [x] Define `Post` type (matching `posts` table)
- [x] Define `Card` type (matching `cards` table)
- [x] Define `FeedItem` type (with nested `post?: Post & { cards: Card[] }` and `queue_item?: QueueItem`)
- [x] Define `QueueItem` type (matching `queue_items` table)
- [x] Define `CostRecord` type (matching `cost_records` table)
- [x] Define `FavoriteGroup` type (matching `favorite_groups` table, with optional `favorites`)
- [x] Define `Favorite` type (matching `favorites` table)
- [x] Define `LLMCardOutput` type (shape returned by LLM JSON: `{ title, cards }`) — uses `LLMCardItem` discriminated union
- [x] Export all types from `packages/shared/mod.ts`

---

## Phase 3 — Edge Function: `ingest`

**Goal**: `POST /functions/v1/ingest` accepts `{ type: 'url'|'text', value: string }`, validates, inserts `queue_item` and `feed_item`, returns `202 { queue_item_id, feed_item_id }`.

Directory: `supabase/functions/ingest/`

- [x] Create `supabase/functions/ingest/deno.json`
- [x] Create `supabase/functions/ingest/index.ts` — Hono app wrapped in `Deno.serve()`
- [x] Implement `POST /` handler:
  - [x] Extract `Authorization` header, call `supabase.auth.getUser()` → 401 if missing/invalid
  - [x] Parse and validate request body (`type`, `value`):
    - URL: validate format with URL constructor; reject non-http/https
    - Text: validate min 3 chars, max 10,000 chars
  - [x] INSERT into `queue_items` with status `pending`
  - [x] Compute next `feed_item.position`: `SELECT MAX(position) + 1 FROM feed_items WHERE user_id = $uid`
  - [x] INSERT into `feed_items` (post_id=null, state='unread', queue_item_id)
  - [x] Return `202 { queue_item_id, feed_item_id }`
- [x] Add input sanitization (strip dangerous characters from text input)
- [x] Add structured error responses `{ error: string }` with appropriate HTTP status codes
- [ ] Test locally: `supabase functions serve ingest --env-file .env.local`

---

## Phase 4 — Processing Worker (Fly.io)

**Goal**: An always-on Deno worker polls `queue_items`, fetches/processes content, calls LLM, and writes posts + cards to the database.

Directory: `worker/`

### 4.1 Worker scaffold

- [x] Create `worker/deno.json` (name: `@brainheal/worker`, tasks: `dev`, `start`)
- [x] Create `worker/main.ts` — entry point, starts poll loop, health check server
- [x] Create `worker/processor.ts` — main processing logic
- [x] Create `worker/llm.ts` — LLM abstraction layer
- [x] Create `worker/fetcher.ts` — article fetch + Readability extraction
- [x] Create `worker/budget.ts` — daily cost budget enforcement
- [x] Create `worker/Dockerfile`
- [x] Create `worker/fly.toml`

### 4.2 LLM abstraction (`worker/llm.ts`)

- [x] Define `LLMProvider` interface: `{ summarize(content: string): Promise<LLMCardOutput> }`
- [x] Implement `OpenAIProvider` class using `npm:openai`
- [x] Implement `AnthropicProvider` class using `npm:@anthropic-ai/sdk`
- [x] Factory function `createLLMProvider(provider: string, apiKey: string): LLMProvider`
- [x] Implement structured prompt (system prompt + article content)
- [x] Parse and validate LLM JSON response against `LLMCardOutput` type
- [x] Retry once on malformed JSON (stricter prompt on retry)

### 4.3 Article fetcher (`worker/fetcher.ts`)

- [x] Implement `fetchArticle(url: string): Promise<{ text: string; title: string; images: string[] }>`
- [x] Use `fetch()` with appropriate headers (user-agent)
- [x] Extract article body using `npm:@mozilla/readability` + `npm:linkedom` (DOM parser for Deno)
- [x] Handle HTTP errors (4xx → paywall/not found; 5xx → retry)
- [x] Handle redirects, timeouts (10s max)
- [x] For free text input: implement `researchTopic(topic: string): Promise<string>` (LLM first-pass synthesis)

### 4.4 Budget enforcement (`worker/budget.ts`)

- [x] Implement `checkDailyBudget(supabase, userId): Promise<boolean>`:
  - Fetch user's `billing_tier` from `profiles`
  - Compute `monthly_budget` based on tier (env var config: `FREE_MONTHLY_BUDGET_USD`, `PAID_MONTHLY_BUDGET_USD`)
  - Query `cost_records` for current month's spend
  - Compute `daily_limit = remaining_budget / remaining_days_in_month`
  - Query today's spend; return `today_spend < daily_limit`

### 4.5 Core processor (`worker/processor.ts`)

- [x] Implement `processNextItem(supabase, llm): Promise<void>`:
  - [x] `SELECT ... FROM queue_items WHERE status='pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
  - [x] If no item: return immediately
  - [x] `UPDATE queue_items SET status='processing', started_at=now()`
  - [x] Check daily budget — if over: revert to pending, return
  - [x] Branch on `input_type`:
    - `url`: call `fetchArticle(url)`
    - `text`: call `researchTopic(text)` then treat result as article content
  - [x] Call `llm.summarize(content)` → `{ title, cards }`
  - [x] For `image` cards: upload images to Supabase Storage → get public URLs
  - [x] `INSERT INTO posts (user_id, source_url, source_text, title, status='ready')`
  - [x] `INSERT INTO cards (post_id, position, content_type, text_content, media_url, media_caption)` for each card
  - [x] `UPDATE feed_items SET post_id=<new post id>` (Realtime fires here)
  - [x] `INSERT INTO cost_records (user_id, queue_item_id, tokens_input, tokens_output, cost_usd, model_used)`
  - [x] `UPDATE queue_items SET status='completed', completed_at=now()`

### 4.6 Error handling in processor

- [x] Wrap processing in try/catch; on error:
  - Increment `retry_count`
  - If `retry_count < 2`: set status back to `pending` (re-queued)
  - If `retry_count >= 2`: set status to `failed`, `UPDATE posts SET status='failed', error_message=...`
- [x] Log structured JSON: `{ level, message, queue_item_id, user_id, error }`

### 4.7 Poll loop & health check (`worker/main.ts`)

- [x] Implement poll loop: `setInterval(processNextItem, 5000)` (5s interval, from env `POLL_INTERVAL_MS`)
- [x] Implement health check HTTP server on port 8080: `GET /health` → `200 { status: 'ok' }`
- [x] Handle graceful shutdown on `SIGTERM`

### 4.8 Dockerfile

- [x] Use `denoland/deno:2.2.2` base image (pinned for reproducibility)
- [x] Copy `worker/` and `packages/shared/` files; cache dependencies
- [x] Runs as non-root user (`deno`)
- [x] `CMD ["deno", "run", "--allow-all", "main.ts"]`

---

## Phase 5 — Frontend: Project Scaffold & Auth

**Goal**: Vite + React PWA boots, connects to Supabase, and has a working auth flow (email + Google OAuth).

Directory: `frontend/`

### 5.1 Project scaffold

- [x] `deno init --npm vite` inside `frontend/` using React + TypeScript template
- [x] Create `frontend/deno.json` (name: `@brainheal/frontend`, tasks: `dev`, `build`, `preview`)
- [x] Configure `frontend/vite.config.ts`:
  - React plugin
  - Path alias `@/` → `frontend/src/`
  - PWA plugin (`vite-plugin-pwa`) — web app manifest, service worker
- [x] Configure `deno.json` at root: `nodeModulesDir: "auto"` + `optimizeDeps.include` for React packages
- [x] Configure PWA manifest (`public/manifest.json`):
  - `name`, `short_name`, `start_url`, `display: standalone`
  - `share_target` entry pointing to `/share` (OS Share Sheet support)
- [x] Install and configure `@supabase/supabase-js`
- [x] Create `frontend/src/lib/supabase.ts` — export single `supabase` client initialized with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

### 5.2 Auth UI

- [x] Create `frontend/src/pages/LoginPage.tsx`:
  - Email + password sign-in form
  - "Sign up" toggle
  - "Continue with Google" button (`supabase.auth.signInWithOAuth({ provider: 'google' })`)
  - Display error messages
- [x] Create `frontend/src/hooks/useAuth.ts`:
  - Wraps `supabase.auth.getSession()` + `supabase.auth.onAuthStateChange()`
  - Returns `{ user, session, loading }`
- [x] Create `frontend/src/components/AuthGuard.tsx` — layout route; redirects unauthenticated users to `/login`
- [x] Wire up React Router: `/login` → `LoginPage`, all other routes wrapped in `AuthGuard`
- [x] Create `frontend/src/App.tsx` — BrowserRouter + Routes; loading spinner while session resolves; placeholder screens for Phase 6+ routes
- [x] Create `frontend/src/components/BottomNav.tsx` — 4-tab bottom navigation (Feed, Saved, Queue, Settings)

---

## Phase 6 — Frontend: Content Submission

**Goal**: User can submit a URL or free text. Item appears in queue immediately. Share Target PWA handler works.

### 6.1 Add Content screen

- [x] Create `frontend/src/pages/AddContentPage.tsx`:
  - Input field (URL or text)
  - Submit button — calls `supabase.functions.invoke('ingest', { body: { type, value } })`
  - Loading state during submission
  - Success toast / redirect to Feed on success
  - Error display on failure
- [x] Detect input type: if value matches URL pattern → `type: 'url'`, else → `type: 'text'`

### 6.2 PWA Share Target handler

- [x] Create `frontend/src/pages/ShareTargetPage.tsx`:
  - On mount: read `?url=` and `?text=` query params (set by Share Target manifest entry)
  - Auto-invoke `ingest` Edge Function with received data
  - Show "Saving…" → success/error state
  - Redirect to Feed after success
- [x] Add `/share` route pointing to `ShareTargetPage`

---

## Phase 7 — Frontend: Feed Screen

**Goal**: Main feed screen renders cards, handles swipe gestures, shows skeleton for in-progress posts, and updates in realtime.

### 7.1 Data fetching

- [x] Create `frontend/src/hooks/useFeed.ts`:
  - Calls PostgREST feed query (see `specs/api.md` §1)
  - Paginates (page size 20)
  - Returns `{ items, loading, error, loadMore, removeItem, refreshItem }`
  - Realtime subscription integrated (no separate hook needed)

### 7.2 Feed layout

- [x] Create `frontend/src/pages/FeedPage.tsx`:
  - Vertically scrollable list of `PostView` components
  - FAB button → navigates to Add Content
  - Empty state: "All caught up!" message
- [x] Create `frontend/src/components/PostView.tsx`:
  - Horizontally swipeable carousel of `CardView` components (use `react-swipeable`)
  - Progress dots (card position indicator)
  - Post footer: title, source URL
  - Action bar: favorite button (star)
  - Gesture handling:
    - Swipe LEFT on last card → `supabase.rpc('mark_feed_item_read', { item_id })`
    - Swipe RIGHT on first card → `supabase.rpc('snooze_feed_item', { item_id })`
- [x] Create `frontend/src/components/CardView.tsx`:
  - Renders card content by `content_type`:
    - `text`: Markdown renderer (use `react-markdown`)
    - `key_points`: bulleted list
    - `quote`: styled blockquote
    - `image`: `<img>` with caption
- [x] Create `frontend/src/components/SkeletonCard.tsx`:
  - Shown when `feed_item.post_id` is null (still processing)
  - Shows queue status and input value truncated

---

## Phase 8 — Frontend: Processing Queue Screen

**Goal**: User can view submitted items with their processing status.

- [x] Create `frontend/src/pages/QueuePage.tsx`:
  - Fetches `queue_items` sorted by `created_at DESC`
  - Polls every 5s (no Realtime needed per spec)
  - Renders `QueueItemRow` inline component for each item
- [x] `QueueItemRow` component (inline in QueuePage.tsx):
  - Shows `input_value` (truncated URL or text)
  - Shows status badge: `pending` | `processing` | `completed` | `failed`
  - For `failed`: shows `error_message`, retry button (re-invokes `ingest` with same value)

---

## Phase 9 — Frontend: Favorites Screen

**Goal**: User can save posts to favorites, organize into groups, and browse saved posts.

### 9.1 Favorites data hooks

- [x] Data fetching inline in `FavoritesPage.tsx` (no separate hook needed for MVP)

### 9.2 Favorites UI

- [x] Create `frontend/src/pages/FavoritesPage.tsx`:
  - Left sidebar: group list with count badges and delete buttons
  - Right main area: list of saved posts for selected group
- [x] Create `frontend/src/components/SaveButton.tsx`:
  - Used in `PostView` action bar
  - Tap → immediately inserts into default "Saved" group
  - Shows filled star when saved

### 9.3 Favorite group management

- [x] Create group: inline `supabase.from('favorite_groups').insert(...)` in FavoritesPage
- [x] Delete group (non-default): inline in FavoritesPage
- [x] Remove post from favorites: inline in FavoritesPage

---

## Phase 10 — Frontend: Settings & Profile Screen

**Goal**: User can view their account info, update nickname, and sign out.

- [x] Create `frontend/src/pages/SettingsPage.tsx`:
  - Display user email (from `supabase.auth.getUser()`)
  - Display + edit nickname (from `profiles` table)
  - Display billing tier (free/paid)
  - Sign out button (`supabase.auth.signOut()`)
- [x] Nickname update: `supabase.from('profiles').update({ nickname }).eq('id', userId)`

---

## Phase 11 — Navigation & App Shell

**Goal**: Bottom navigation bar, routing, and global layout are complete.

- [x] Create `frontend/src/components/BottomNav.tsx`:
  - 4 tabs: Feed, Favorites, Queue, Settings
  - Active tab highlighted
- [x] Create `frontend/src/App.tsx`:
  - React Router setup with all routes
  - `AuthGuard` wrapping protected routes
  - `BottomNav` visible on all authenticated screens
- [x] Configure React Router routes:
  - `/login` → `LoginPage`
  - `/` → `FeedPage`
  - `/add` → `AddContentPage`
  - `/share` → `ShareTargetPage`
  - `/queue` → `QueuePage`
  - `/favorites` → `FavoritesPage`
  - `/settings` → `SettingsPage`

---

## Phase 12 — Polish, PWA & Deployment

**Goal**: App is deployable, installable as PWA, passes basic quality checks.

### 12.1 PWA completeness

- [x] Service worker configured (via `vite-plugin-pwa`): cache static assets (auto-generated)
- [x] `manifest.json` complete: icons (512px, 192px) referenced, theme color, `share_target`
- [ ] Add actual PNG icon files (192x192 and 512x512) to `frontend/public/`
- [ ] Add "Add to home screen" prompt handling
- [ ] Test Share Target on mobile (Chrome on Android / Safari on iOS)

### 12.2 Performance & accessibility

- [ ] Card swipe transitions: CSS `scroll-snap` or transition at 60fps (test on low-end device)
- [ ] Semantic HTML on all screens; `aria-label` on icon buttons
- [ ] Loading skeletons on all async data (feed, queue, favorites)
- [ ] Error boundaries on main screens

### 12.3 Deployment

- [ ] `supabase db push` to production Supabase project (run all migrations)
- [ ] Deploy Edge Function: `supabase functions deploy ingest`
- [ ] Push frontend to Netlify: `netlify deploy --prod` (or via Git push trigger)
- [ ] Deploy worker to Fly.io: `fly deploy --config worker/fly.toml`
- [ ] Smoke-test end-to-end:
  - Register user → auto-profile + "Saved" group created
  - Submit URL → queue item appears in Queue screen
  - Worker picks up → Realtime updates feed → cards appear
  - Swipe LEFT on last card → feed item disappears
  - Swipe RIGHT on first card → feed item moves to bottom
  - Save post → appears in Favorites

---

## Open Items / Decisions Deferred to Implementation

| # | Item | Notes |
|---|---|---|
| 1 | LLM model selection | Use env var `LLM_PROVIDER` (`openai`/`anthropic`) + `LLM_MODEL` for specific model |
| 2 | Free tier article limit | Set `FREE_MONTHLY_BUDGET_USD=1.00` in worker env initially; adjust after observing usage |
| 3 | Paid tier pricing | Deferred to Phase 2 (Billing/Stripe) |
| 4 | Worker poll interval | Start at 5s (`POLL_INTERVAL_MS=5000`) |
| 5 | Supabase plan upgrade trigger | Monitor; upgrade when approaching 500MB DB or 500K Edge Function calls |
| 6 | Apple Sign-In | Supabase supports it; add provider to `config.toml` when needed |

---

## Phase Milestones Summary

| Phase | Deliverable | Critical path? |
|---|---|---|
| 0 | Repo + infra bootstrapped | Yes |
| 1 | All DB tables, triggers, RLS, RPCs migrated | Yes |
| 2 | Shared types package | Yes (unblocks frontend + worker type safety) |
| 3 | `ingest` Edge Function | Yes |
| 4 | Processing worker (Fly.io) | Yes |
| 5 | Frontend: auth flow | Yes |
| 6 | Frontend: content submission | Yes |
| 7 | Frontend: feed + cards + gestures + realtime | Yes |
| 8 | Frontend: queue screen | No (nice to have at launch) |
| 9 | Frontend: favorites | No (nice to have at launch) |
| 10 | Frontend: settings | No |
| 11 | Navigation & app shell | Yes |
| 12 | PWA polish + production deploy | Yes |

The **critical path** is: Phase 0 → 1 → 2 → 3 + 4 (parallel) → 5 → 6 + 11 (parallel) → 7 → 12.
