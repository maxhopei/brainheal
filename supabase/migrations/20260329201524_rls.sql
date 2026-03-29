-- Migration: Row Level Security (RLS) policies
-- All public tables have RLS enabled. Users can only access their own data.
-- The Fly.io worker uses the service_role key which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Enable RLS on all public tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_records    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

CREATE POLICY "posts_select_own"
  ON public.posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id);

-- INSERT is performed by the worker (service_role, bypasses RLS). No user INSERT policy needed.

-- ---------------------------------------------------------------------------
-- cards — users can read cards belonging to their own posts
-- ---------------------------------------------------------------------------

CREATE POLICY "cards_select_own"
  ON public.cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = cards.post_id
        AND posts.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE performed by the worker only.

-- ---------------------------------------------------------------------------
-- feed_items
-- ---------------------------------------------------------------------------

CREATE POLICY "feed_items_select_own"
  ON public.feed_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feed_items_update_own"
  ON public.feed_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feed_items_delete_own"
  ON public.feed_items FOR DELETE
  USING (auth.uid() = user_id);

-- INSERT is performed by the ingest Edge Function (using service_role or anon key with user context).
-- We allow INSERT for authenticated users via Edge Function (service_role bypasses RLS).

-- ---------------------------------------------------------------------------
-- queue_items
-- ---------------------------------------------------------------------------

CREATE POLICY "queue_items_select_own"
  ON public.queue_items FOR SELECT
  USING (auth.uid() = user_id);

-- Users may delete their own pending items (cancel a queued request)
CREATE POLICY "queue_items_delete_own_pending"
  ON public.queue_items FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

-- INSERT is performed by the ingest Edge Function (service_role bypasses RLS).

-- ---------------------------------------------------------------------------
-- favorite_groups
-- ---------------------------------------------------------------------------

CREATE POLICY "favorite_groups_select_own"
  ON public.favorite_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "favorite_groups_insert_own"
  ON public.favorite_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favorite_groups_update_own"
  ON public.favorite_groups FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete non-default groups
CREATE POLICY "favorite_groups_delete_own_nondefault"
  ON public.favorite_groups FOR DELETE
  USING (auth.uid() = user_id AND is_default = false);

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------

CREATE POLICY "favorites_select_own"
  ON public.favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "favorites_insert_own"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favorites_update_own"
  ON public.favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favorites_delete_own"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- reactions
-- ---------------------------------------------------------------------------

CREATE POLICY "reactions_select_own"
  ON public.reactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "reactions_insert_own"
  ON public.reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_update_own"
  ON public.reactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_delete_own"
  ON public.reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- cost_records — read-only for users; written by worker only
-- ---------------------------------------------------------------------------

CREATE POLICY "cost_records_select_own"
  ON public.cost_records FOR SELECT
  USING (auth.uid() = user_id);
