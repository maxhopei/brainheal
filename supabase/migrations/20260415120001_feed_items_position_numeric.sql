-- feed_items.position must support decimal values for "Read Next" positioning
-- (parent_position + 0.5 places the child immediately after its parent)
ALTER TABLE public.feed_items
  ALTER COLUMN position TYPE numeric USING position::numeric;

-- Update snooze_feed_item to use numeric so it correctly reads decimal positions
-- (e.g. max position of 12.5 → snooze goes to 13.5, not 13)
CREATE OR REPLACE FUNCTION public.snooze_feed_item(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_max_position numeric;
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
