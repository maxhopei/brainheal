-- Migration: Worker RPC — claim_next_queue_item
-- Atomically claims the next pending queue item for the worker.
-- Uses FOR UPDATE SKIP LOCKED so multiple workers can run without contention.
-- Returns the claimed row, or NULL if the queue is empty.
-- This must be called with service_role (worker bypasses RLS).

CREATE OR REPLACE FUNCTION public.claim_next_queue_item()
RETURNS public.queue_items
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
    RETURN NULL;
  END IF;

  UPDATE public.queue_items
  SET status = 'processing',
      started_at = now()
  WHERE id = claimed.id;

  -- Return the updated row
  SELECT * INTO claimed FROM public.queue_items WHERE id = claimed.id;
  RETURN claimed;
END;
$$;

COMMENT ON FUNCTION public.claim_next_queue_item() IS
  'Atomically claims and returns the next pending queue item. Returns NULL if queue is empty.';
