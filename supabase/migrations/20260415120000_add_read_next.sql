-- Add parent tracking to queue_items
-- parent_post_id: the post the user was reading when they triggered "Read next"
-- parent_card_id: the specific card within that post
ALTER TABLE queue_items
  ADD COLUMN parent_post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  ADD COLUMN parent_card_id uuid REFERENCES cards(id) ON DELETE SET NULL;

-- Add parent tracking to feed_items
-- parent_post_id: used to position the new post immediately after its parent in the feed
ALTER TABLE feed_items
  ADD COLUMN parent_post_id uuid REFERENCES posts(id) ON DELETE SET NULL;

-- Indexes for faster parent lookups
CREATE INDEX idx_feed_items_parent_post ON feed_items(parent_post_id) WHERE parent_post_id IS NOT NULL;
CREATE INDEX idx_queue_items_parent_post ON queue_items(parent_post_id) WHERE parent_post_id IS NOT NULL;

-- RPC: renormalize_feed_positions
-- Reassigns feed positions as integers 1, 2, 3, ... based on current order.
-- Called when positions accumulate too many decimal places (< 0.1 gap).
CREATE OR REPLACE FUNCTION renormalize_feed_positions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC) AS new_pos
    FROM feed_items
    WHERE user_id = p_user_id
      AND state = 'unread'
  )
  UPDATE feed_items
  SET position = ranked.new_pos
  FROM ranked
  WHERE feed_items.id = ranked.id;
END;
$$;
