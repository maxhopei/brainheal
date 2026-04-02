-- Migration: Worker RPC — claim_next_queue_item
-- Atomically claims the next pending queue item for the worker.
-- Uses FOR UPDATE SKIP LOCKED so multiple workers can run without contention.
-- Returns the claimed row as a set, or empty set if the queue is empty.
-- This must be called with service_role (worker bypasses RLS).
--
-- NOTE: The return type was later changed to SETOF in migration
-- 20260330181642_fix_claim_next_queue_item_setof.sql.
-- This file is kept for historical reference only.

CREATE OR REPLACE FUNCTION public.claim_next_queue_item()
RETURNS SETOF public.queue_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.queue_items;
BEGIN
  SELECT *
  INTO claimed
  FROM public.queue_items
  WHERE status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.queue_items
  SET status = 'processing',
      started_at = now()
  WHERE id = claimed.id;

  -- Return the updated row
  RETURN QUERY SELECT * FROM public.queue_items WHERE id = claimed.id;
END;
$$;

COMMENT ON FUNCTION public.claim_next_queue_item() IS
  'Atomically claims and returns the next pending queue item. Returns NULL if queue is empty.';
