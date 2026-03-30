-- Migration: Initial schema
-- Creates all core tables for BrainHeal MVP.

-- ---------------------------------------------------------------------------
-- profiles — extends auth.users 1:1 with app-specific data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname     text        UNIQUE,
  billing_tier text        NOT NULL DEFAULT 'free' CHECK (billing_tier IN ('free', 'paid')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'App-specific user profile data. 1:1 with auth.users.';

-- ---------------------------------------------------------------------------
-- posts — a processed unit of ingested content
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.posts (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_url    text,
  source_text   text,
  title         text        NOT NULL DEFAULT '',
  status        text        NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.posts IS 'A processed post — one per ingested article or topic.';

-- ---------------------------------------------------------------------------
-- cards — individual swipeable cards within a post
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cards (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  position      integer     NOT NULL CHECK (position >= 1),
  content_type  text        NOT NULL CHECK (content_type IN ('text', 'image', 'key_points', 'quote')),
  text_content  text,
  media_url     text,
  media_caption text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cards IS '1-based ordered cards within a post.';

-- ---------------------------------------------------------------------------
-- queue_items — doubles as processing queue + history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.queue_items (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  input_type    text        NOT NULL CHECK (input_type IN ('url', 'text')),
  input_value   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  retry_count   integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

COMMENT ON TABLE public.queue_items IS 'Processing queue. Worker uses FOR UPDATE SKIP LOCKED to claim items.';

-- ---------------------------------------------------------------------------
-- feed_items — the user''s feed state (position, read/unread)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feed_items (
  id                 uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id            uuid        REFERENCES public.posts(id) ON DELETE SET NULL,
  queue_item_id      uuid        NOT NULL REFERENCES public.queue_items(id) ON DELETE CASCADE,
  position           bigint      NOT NULL,
  state              text        NOT NULL DEFAULT 'unread' CHECK (state IN ('unread', 'read')),
  source_type        text        NOT NULL DEFAULT 'self' CHECK (source_type IN ('self', 'shared', 'suggested')),
  shared_by_user_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  shared_message     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  read_at            timestamptz
);

COMMENT ON TABLE public.feed_items IS 'Per-user feed state. position is a monotonic bigint; snooze = max(position)+1.';

-- ---------------------------------------------------------------------------
-- favorite_groups — user-created collections for saved posts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.favorite_groups (
  id         uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  position   integer     NOT NULL DEFAULT 0,
  is_default boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.favorite_groups IS 'User-defined groups for organizing saved posts. One default "Saved" group per user.';

-- ---------------------------------------------------------------------------
-- favorites — saved posts within a group
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.favorites (
  id         uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id    uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  group_id   uuid        NOT NULL REFERENCES public.favorite_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

COMMENT ON TABLE public.favorites IS 'A post saved by a user. A post can be in exactly one group.';

-- ---------------------------------------------------------------------------
-- reactions — like / meh per post per user
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reactions (
  id         uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id    uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('like', 'meh')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

COMMENT ON TABLE public.reactions IS 'User reaction to a post. Mutually exclusive per (user, post).';

-- ---------------------------------------------------------------------------
-- cost_records — per-job LLM cost tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cost_records (
  id             uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  queue_item_id  uuid        NOT NULL REFERENCES public.queue_items(id) ON DELETE CASCADE,
  tokens_input   integer     NOT NULL DEFAULT 0,
  tokens_output  integer     NOT NULL DEFAULT 0,
  cost_usd       numeric(10, 6) NOT NULL DEFAULT 0,
  model_used     text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cost_records IS 'LLM token usage and cost per processing job. Used for budget enforcement.';

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------

-- Feed query: user's unread items sorted by position
CREATE INDEX IF NOT EXISTS idx_feed_items_user_state_pos
  ON public.feed_items (user_id, state, position ASC);

-- Worker queue claim: pending items oldest-first
CREATE INDEX IF NOT EXISTS idx_queue_items_status_created
  ON public.queue_items (status, created_at ASC)
  WHERE status = 'pending';

-- Favorites lookup
CREATE INDEX IF NOT EXISTS idx_favorites_user_post
  ON public.favorites (user_id, post_id);

-- Cost budget queries: user's costs this month
CREATE INDEX IF NOT EXISTS idx_cost_records_user_created
  ON public.cost_records (user_id, created_at DESC);
