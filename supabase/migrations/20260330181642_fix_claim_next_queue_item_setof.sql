-- Migration: Fix claim_next_queue_item return type
-- Changes RETURNS public.queue_items → RETURNS SETOF public.queue_items so that
-- PostgREST serialises the result as a JSON array. An empty queue returns [],
-- and a claimed item returns [{...}]. The previous scalar return caused PostgREST
-- to return a null-field object when the function returned NULL (empty queue).
--
-- DROP is required because Postgres does not allow CREATE OR REPLACE to change
-- a function's return type.

DROP FUNCTION IF EXISTS public.claim_next_queue_item();

CREATE FUNCTION public.claim_next_queue_item()
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

  RETURN QUERY SELECT * FROM public.queue_items WHERE id = claimed.id;
END;
$$;

COMMENT ON FUNCTION public.claim_next_queue_item() IS
  'Atomically claims and returns the next pending queue item. Returns empty set if queue is empty.';
