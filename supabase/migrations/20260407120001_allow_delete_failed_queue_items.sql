-- Allow users to delete their own failed queue items (in addition to pending)
-- The original policy only allowed deleting pending items

DROP POLICY "queue_items_delete_own_pending" ON public.queue_items;

CREATE POLICY "queue_items_delete_own_pending_or_failed"
  ON public.queue_items FOR DELETE
  USING (auth.uid() = user_id AND status IN ('pending', 'failed'));
