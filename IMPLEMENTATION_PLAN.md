# BrainHeal — MVP Implementation Plan

**Scope**: Mobile-first PWA backed by Supabase + Fly.io worker.  
**Key decisions**: LLM provider abstracted behind interface (env-var selected), frontend on Netlify, Google OAuth included from day one.

---

## How to read this plan

Tasks are grouped into phases. Each phase has a goal milestone. Work is broadly sequential within a phase, but tasks within a phase that have no dependencies can be done in parallel.

Progress tracking legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Repository & Infrastructure Bootstrap

**Goal**: Local toolchain ready, Supabase project running, Fly.io app created, all secrets in place.

### 0.1 Workspace skeleton

- [ ] Create root `deno.json` (workspace array, shared imports: `hono`, `@supabase/supabase-js`, `@std/assert`)
- [ ] Create `deno.lock`
- [ ] Add `.gitignore` (`.env*`, `dist/`, `node_modules/`, `.DS_Store`)
- [ ] Create `packages/shared/deno.json` (name: `@brainheal/shared`)
- [ ] Create `packages/shared/mod.ts` (barrel export — empty for now)

### 0.2 Supabase project

- [ ] Install Supabase CLI (`brew install supabase/tap/supabase`)
- [ ] `supabase init` — creates `supabase/` directory with `config.toml`
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

- [ ] Install `flyctl` (`brew install flyctl`)
- [ ] `fly auth login`
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

- [ ] Create `profiles` table (id, nickname, billing_tier, created_at, updated_at)
- [ ] Create `posts` table (id, user_id, source_url, source_text, title, status, error_message, created_at, updated_at)
- [ ] Create `cards` table (id, post_id, position, content_type, text_content, media_url, media_caption, created_at)
- [ ] Create `feed_items` table (id, user_id, post_id, queue_item_id, position, state, source_type, shared_by_user_id, shared_message, created_at, read_at)
- [ ] Create `queue_items` table (id, user_id, input_type, input_value, status, error_message, retry_count, created_at, started_at, completed_at)
- [ ] Create `cost_records` table (id, user_id, queue_item_id, tokens_input, tokens_output, cost_usd, model_used, created_at)
- [ ] Create `favorite_groups` table (id, user_id, name, position, is_default, created_at)
- [ ] Create `favorites` table (id, user_id, post_id, group_id, created_at)
- [ ] Create `reactions` table (id, user_id, post_id, type, created_at)
- [ ] Add indices: `feed_items(user_id, state, position)`, `queue_items(status, created_at)`, `favorites(user_id, post_id)`

### 1.2 Triggers migration

File: `supabase/migrations/<timestamp>_triggers.sql`

- [ ] `handle_new_user()` — auto-insert `profiles` row on `auth.users` INSERT
- [ ] `on_auth_user_created` trigger on `auth.users`
- [ ] `handle_new_profile()` — auto-insert default "Saved" `favorite_groups` row on `profiles` INSERT
- [ ] `on_profile_created` trigger on `profiles`

### 1.3 RLS policies migration

File: `supabase/migrations/<timestamp>_rls.sql`

- [ ] Enable RLS on all `public` tables
- [ ] `profiles`: SELECT/UPDATE own row only
- [ ] `posts`: SELECT own posts; DELETE own posts
- [ ] `cards`: SELECT cards of own posts
- [ ] `feed_items`: SELECT/UPDATE/DELETE own items
- [ ] `queue_items`: SELECT own items; DELETE own pending items
- [ ] `favorite_groups`: SELECT/INSERT/UPDATE own groups; DELETE own non-default groups
- [ ] `favorites`: SELECT/INSERT/DELETE own favorites
- [ ] `reactions`: SELECT/INSERT/UPDATE/DELETE own reactions
- [ ] `cost_records`: SELECT own records

### 1.4 RPC functions migration

File: `supabase/migrations/<timestamp>_rpc_functions.sql`

- [ ] `snooze_feed_item(item_id uuid)` — UPDATE position to `MAX(position)+1` for auth.uid()
- [ ] `mark_feed_item_read(item_id uuid)` — UPDATE state='read', read_at=now() for auth.uid()

### 1.5 Verify schema

- [ ] `supabase db push` (or `supabase migration up`) applies all migrations cleanly
- [ ] Manually verify tables, triggers, and policies in Supabase Dashboard (or `supabase studio`)

---

## Phase 2 — Shared Types Package

**Goal**: A single `@brainheal/shared` package exports all TypeScript types used across frontend, worker, and Edge Functions.

- [ ] Define `CardType` union type: `'text' | 'image' | 'key_points' | 'quote'`
- [ ] Define `PostStatus` union type: `'processing' | 'ready' | 'failed'`
- [ ] Define `QueueStatus` union type: `'pending' | 'processing' | 'completed' | 'failed'`
- [ ] Define `FeedItemState` union type: `'unread' | 'read'`
- [ ] Define `BillingTier` union type: `'free' | 'paid'`
- [ ] Define `SourceType` union type: `'self' | 'shared' | 'suggested'`
- [ ] Define `InputType` union type: `'url' | 'text'`
- [ ] Define `ReactionType` union type: `'like' | 'meh'`
- [ ] Define `Profile` type (matching `profiles` table)
- [ ] Define `Post` type (matching `posts` table)
- [ ] Define `Card` type (matching `cards` table)
- [ ] Define `FeedItem` type (with nested `post?: Post & { cards: Card[] }` and `queue_item?: QueueItem`)
- [ ] Define `QueueItem` type (matching `queue_items` table)
- [ ] Define `CostRecord` type (matching `cost_records` table)
- [ ] Define `FavoriteGroup` type (matching `favorite_groups` table, with optional `favorites`)
- [ ] Define `Favorite` type (matching `favorites` table)
- [ ] Define `LLMCardOutput` type (shape returned by LLM JSON: `{ title, cards }`)
- [ ] Export all types from `packages/shared/mod.ts`

---

## Phase 3 — Edge Function: `ingest`

**Goal**: `POST /functions/v1/ingest` accepts `{ type: 'url'|'text', value: string }`, validates, inserts `queue_item` and `feed_item`, returns `202 { queue_item_id, feed_item_id }`.

Directory: `supabase/functions/ingest/`

- [ ] Create `supabase/functions/ingest/deno.json`
- [ ] Create `supabase/functions/ingest/index.ts` — Hono app wrapped in `Deno.serve()`
- [ ] Implement `POST /` handler:
  - [ ] Extract `Authorization` header, call `supabase.auth.getUser()` → 401 if missing/invalid
  - [ ] Parse and validate request body (`type`, `value`):
    - URL: validate format with URL constructor; reject non-http/https
    - Text: validate min 3 chars, max 1000 chars
  - [ ] INSERT into `queue_items` with status `pending`
  - [ ] Compute next `feed_item.position`: `SELECT COALESCE(MAX(position), 0) + 1 FROM feed_items WHERE user_id = $uid`
  - [ ] INSERT into `feed_items` (post_id=null, state='unread', queue_item_id)
  - [ ] Return `202 { queue_item_id, feed_item_id }`
- [ ] Add input sanitization (strip dangerous characters from text input)
- [ ] Add structured error responses `{ error: string }` with appropriate HTTP status codes
- [ ] Test locally: `supabase functions serve ingest --env-file .env.local`

---

## Phase 4 — Processing Worker (Fly.io)

**Goal**: An always-on Deno worker polls `queue_items`, fetches/processes content, calls LLM, and writes posts + cards to the database.

Directory: `worker/`

### 4.1 Worker scaffold

- [ ] Create `worker/deno.json` (name: `@brainheal/worker`, tasks: `dev`, `start`)
- [ ] Create `worker/main.ts` — entry point, starts poll loop, health check server
- [ ] Create `worker/processor.ts` — main processing logic
- [ ] Create `worker/llm.ts` — LLM abstraction layer
- [ ] Create `worker/fetcher.ts` — article fetch + Readability extraction
- [ ] Create `worker/budget.ts` — daily cost budget enforcement
- [ ] Create `worker/Dockerfile`
- [ ] Create `worker/fly.toml`

### 4.2 LLM abstraction (`worker/llm.ts`)

- [ ] Define `LLMProvider` interface: `{ summarize(content: string): Promise<LLMCardOutput> }`
- [ ] Implement `OpenAIProvider` class using `npm:openai`
- [ ] Implement `AnthropicProvider` class using `npm:@anthropic-ai/sdk`
- [ ] Factory function `createLLMProvider(provider: string, apiKey: string): LLMProvider`
- [ ] Implement structured prompt (system prompt + article content)
- [ ] Parse and validate LLM JSON response against `LLMCardOutput` type
- [ ] Retry once on malformed JSON (stricter prompt on retry)

### 4.3 Article fetcher (`worker/fetcher.ts`)

- [ ] Implement `fetchArticle(url: string): Promise<{ text: string; title: string; images: string[] }>`
- [ ] Use `fetch()` with appropriate headers (user-agent)
- [ ] Extract article body using `npm:@mozilla/readability` + `npm:linkedom` (DOM parser for Deno)
- [ ] Handle HTTP errors (4xx → paywall/not found; 5xx → retry)
- [ ] Handle redirects, timeouts (10s max)
- [ ] For free text input: implement `researchTopic(topic: string): Promise<string>` (LLM first-pass synthesis)

### 4.4 Budget enforcement (`worker/budget.ts`)

- [ ] Implement `checkDailyBudget(supabase, userId): Promise<boolean>`:
  - Fetch user's `billing_tier` from `profiles`
  - Compute `monthly_budget` based on tier (env var config: `FREE_MONTHLY_BUDGET_USD`, `PAID_MONTHLY_BUDGET_USD`)
  - Query `cost_records` for current month's spend
  - Compute `daily_limit = remaining_budget / remaining_days_in_month`
  - Query today's spend; return `today_spend < daily_limit`

### 4.5 Core processor (`worker/processor.ts`)

- [ ] Implement `processNextItem(supabase, llm): Promise<void>`:
  - [ ] `SELECT ... FROM queue_items WHERE status='pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
  - [ ] If no item: return immediately
  - [ ] `UPDATE queue_items SET status='processing', started_at=now()`
  - [ ] Check daily budget — if over: revert to pending, return
  - [ ] Branch on `input_type`:
    - `url`: call `fetchArticle(url)`
    - `text`: call `researchTopic(text)` then treat result as article content
  - [ ] Call `llm.summarize(content)` → `{ title, cards }`
  - [ ] For `image` cards: upload images to Supabase Storage → get public URLs
  - [ ] `INSERT INTO posts (user_id, source_url, source_text, title, status='ready')`
  - [ ] `INSERT INTO cards (post_id, position, content_type, text_content, media_url, media_caption)` for each card
  - [ ] `UPDATE feed_items SET post_id=<new post id>` (Realtime fires here)
  - [ ] `INSERT INTO cost_records (user_id, queue_item_id, tokens_input, tokens_output, cost_usd, model_used)`
  - [ ] `UPDATE queue_items SET status='completed', completed_at=now()`

### 4.6 Error handling in processor

- [ ] Wrap processing in try/catch; on error:
  - Increment `retry_count`
  - If `retry_count < 2`: set status back to `pending` (re-queued)
  - If `retry_count >= 2`: set status to `failed`, `UPDATE posts SET status='failed', error_message=...`
- [ ] Log structured JSON: `{ level, message, queue_item_id, user_id, error }`

### 4.7 Poll loop & health check (`worker/main.ts`)

- [ ] Implement poll loop: `setInterval(processNextItem, 5000)` (5s interval, from env `POLL_INTERVAL_MS`)
- [ ] Implement health check HTTP server on port 8080: `GET /health` → `200 { status: 'ok' }`
- [ ] Handle graceful shutdown on `SIGTERM`

### 4.8 Dockerfile

- [ ] Use `denoland/deno:2.7` base image
- [ ] Copy `worker/` files
- [ ] `CMD ["deno", "run", "--allow-all", "main.ts"]`

---

## Phase 5 — Frontend: Project Scaffold & Auth

**Goal**: Vite + React PWA boots, connects to Supabase, and has a working auth flow (email + Google OAuth).

Directory: `frontend/`

### 5.1 Project scaffold

- [ ] `deno init --npm vite` inside `frontend/` using React + TypeScript template
- [ ] Create `frontend/deno.json` (name: `@brainheal/frontend`, tasks: `dev`, `build`, `preview`)
- [ ] Configure `frontend/vite.config.ts`:
  - React plugin
  - Path alias `@/` → `frontend/src/`
  - PWA plugin (`vite-plugin-pwa`) — web app manifest, service worker
- [ ] Configure `tsconfig.json`: strict mode, `paths` for `@/`
- [ ] Configure PWA manifest (`public/manifest.json`):
  - `name`, `short_name`, `start_url`, `display: standalone`
  - `share_target` entry pointing to `/share` (OS Share Sheet support)
- [ ] Install and configure `@supabase/supabase-js`
- [ ] Create `frontend/src/lib/supabase.ts` — export single `supabase` client initialized with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

### 5.2 Auth UI

- [ ] Create `frontend/src/pages/LoginPage.tsx`:
  - Email + password sign-in form
  - "Sign up" toggle
  - "Continue with Google" button (`supabase.auth.signInWithOAuth({ provider: 'google' })`)
  - Display error messages
- [ ] Create `frontend/src/hooks/useAuth.ts`:
  - Wraps `supabase.auth.getSession()` + `supabase.auth.onAuthStateChange()`
  - Returns `{ user, session, loading }`
- [ ] Create `frontend/src/components/AuthGuard.tsx` — redirects unauthenticated users to `/login`
- [ ] Wire up React Router: `/login` → `LoginPage`, all other routes wrapped in `AuthGuard`

---

## Phase 6 — Frontend: Content Submission

**Goal**: User can submit a URL or free text. Item appears in queue immediately. Share Target PWA handler works.

### 6.1 Add Content screen

- [ ] Create `frontend/src/pages/AddContentPage.tsx`:
  - Input field (URL or text)
  - Submit button — calls `supabase.functions.invoke('ingest', { body: { type, value } })`
  - Loading state during submission
  - Success toast / redirect to Feed on success
  - Error display on failure
- [ ] Detect input type: if value matches URL pattern → `type: 'url'`, else → `type: 'text'`

### 6.2 PWA Share Target handler

- [ ] Create `frontend/src/pages/ShareTargetPage.tsx`:
  - On mount: read `?url=` and `?text=` query params (set by Share Target manifest entry)
  - Auto-invoke `ingest` Edge Function with received data
  - Show "Saving…" → success/error state
  - Redirect to Feed after success
- [ ] Add `/share` route pointing to `ShareTargetPage`

---

## Phase 7 — Frontend: Feed Screen

**Goal**: Main feed screen renders cards, handles swipe gestures, shows skeleton for in-progress posts, and updates in realtime.

### 7.1 Data fetching

- [ ] Create `frontend/src/hooks/useFeed.ts`:
  - Calls PostgREST feed query (see `specs/api.md` §1)
  - Paginates (page size 20)
  - Returns `{ items, loading, error, loadMore }`
- [ ] Create `frontend/src/hooks/useFeedRealtime.ts`:
  - Subscribes to `feed_items` UPDATE events filtered by `user_id`
  - On update: merges new `post_id` (and post data) into local feed state

### 7.2 Feed layout

- [ ] Create `frontend/src/pages/FeedPage.tsx`:
  - Vertically scrollable list of `PostView` components
  - FAB button → navigates to Add Content
  - Empty state: "All caught up!" message
- [ ] Create `frontend/src/components/PostView.tsx`:
  - Horizontally swipeable carousel of `CardView` components (use `react-swipeable` or CSS scroll-snap)
  - Progress dots (card position indicator)
  - Post footer: title, source URL
  - Action bar: favorite button (star), share button (later), react button (Phase 2)
  - Gesture handling:
    - Swipe LEFT on last card → `supabase.rpc('mark_feed_item_read', { item_id })`
    - Swipe RIGHT on first card → `supabase.rpc('snooze_feed_item', { item_id })`
- [ ] Create `frontend/src/components/CardView.tsx`:
  - Renders card content by `content_type`:
    - `text`: Markdown renderer (use `react-markdown`)
    - `key_points`: bulleted list
    - `quote`: styled blockquote
    - `image`: `<img>` with caption
  - Full viewport height minus nav chrome
- [ ] Create `frontend/src/components/SkeletonCard.tsx`:
  - Shown when `feed_item.post_id` is null (still processing)
  - Shows queue position indicator if available

---

## Phase 8 — Frontend: Processing Queue Screen

**Goal**: User can view submitted items with their processing status.

- [ ] Create `frontend/src/pages/QueuePage.tsx`:
  - Fetches `queue_items` sorted by `created_at DESC`
  - Polls every 5s (no Realtime needed per spec)
  - Renders `QueueItemRow` for each item
- [ ] Create `frontend/src/components/QueueItemRow.tsx`:
  - Shows `input_value` (truncated URL or text)
  - Shows status badge: `pending` | `processing` | `completed` | `failed`
  - For `failed`: shows `error_message`, retry button (re-invokes `ingest` with same value)
  - For `completed`: links to feed post (if `feed_item.post_id` is set)

---

## Phase 9 — Frontend: Favorites Screen

**Goal**: User can save posts to favorites, organize into groups, and browse saved posts.

### 9.1 Favorites data hooks

- [ ] Create `frontend/src/hooks/useFavorites.ts`:
  - Fetches `favorite_groups` with nested `favorites` + `posts`
  - Returns groups list and mutation helpers

### 9.2 Favorites UI

- [ ] Create `frontend/src/pages/FavoritesPage.tsx`:
  - Left sidebar: list of `FavoriteGroupItem` components
  - Right main area: list of saved posts for selected group
- [ ] Create `frontend/src/components/FavoriteGroupItem.tsx`:
  - Group name + post count
  - "New group" button → inline name input
- [ ] Create `frontend/src/components/SaveButton.tsx`:
  - Used in `PostView` action bar
  - Tap → immediately inserts into default "Saved" group
  - Long-press or second tap → group picker popover

### 9.3 Favorite group management

- [ ] Create group: `supabase.from('favorite_groups').insert(...)` → recompute `position`
- [ ] Delete group (non-default): `supabase.from('favorite_groups').delete().eq('id', groupId)`
- [ ] Move post to different group: `supabase.from('favorites').update({ group_id }).eq('id', favoriteId)`

---

## Phase 10 — Frontend: Settings & Profile Screen

**Goal**: User can view their account info, update nickname, and sign out.

- [ ] Create `frontend/src/pages/SettingsPage.tsx`:
  - Display user email (from `supabase.auth.getUser()`)
  - Display + edit nickname (from `profiles` table)
  - Display billing tier (free/paid)
  - Sign out button (`supabase.auth.signOut()`)
- [ ] Nickname update: `supabase.from('profiles').update({ nickname }).eq('id', userId)`

---

## Phase 11 — Navigation & App Shell

**Goal**: Bottom navigation bar, routing, and global layout are complete.

- [ ] Create `frontend/src/components/BottomNav.tsx`:
  - 4 tabs: Feed, Favorites, Queue, Settings
  - Active tab highlighted
- [ ] Create `frontend/src/App.tsx`:
  - React Router setup with all routes
  - `AuthGuard` wrapping protected routes
  - `BottomNav` visible on all authenticated screens
- [ ] Configure React Router routes:
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

- [ ] Service worker configured (via `vite-plugin-pwa`): cache static assets
- [ ] `manifest.json` complete: icons (512px, 192px), theme color, `share_target`
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
