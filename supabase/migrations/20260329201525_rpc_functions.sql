-- Migration: RPC functions
-- Atomic database operations exposed via PostgREST RPC layer.

-- ---------------------------------------------------------------------------
-- snooze_feed_item(item_id uuid)
-- Moves the given feed item to the bottom of the user's feed by updating its
-- position to MAX(position) + 1 for the authenticated user.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.snooze_feed_item(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_max_position bigint;
BEGIN
  -- Verify ownership
  SELECT user_id INTO v_user_id
  FROM public.feed_items
  WHERE id = item_id
    AND user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Feed item not found or access denied'
      USING ERRCODE = 'P0001';
  END IF;

  -- Compute the current maximum position for this user's feed
  SELECT COALESCE(MAX(position), 0) INTO v_max_position
  FROM public.feed_items
  WHERE user_id = v_user_id;

  -- Move the item to the end
  UPDATE public.feed_items
  SET position = v_max_position + 1
  WHERE id = item_id
    AND user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snooze_feed_item(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- mark_feed_item_read(item_id uuid)
-- Sets state = 'read' and records the read timestamp.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_feed_item_read(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.feed_items
  SET
    state   = 'read',
    read_at = now()
  WHERE id      = item_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feed item not found or access denied'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_feed_item_read(uuid) TO authenticated;
