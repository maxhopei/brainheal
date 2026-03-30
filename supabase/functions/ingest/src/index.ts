/**
 * supabase/functions/ingest/src/index.ts — Content ingestion Edge Function logic.
 *
 * POST /functions/v1/ingest
 * Body: { type: 'url' | 'text', value: string }
 * Returns: 202 { queue_item_id, feed_item_id } or 4xx { error: string }
 *
 * This function:
 * 1. Validates the JWT (via supabase.auth.getUser())
 * 2. Validates the request body
 * 3. Inserts a queue_item (status='pending')
 * 4. Computes the next feed position
 * 5. Inserts a feed_item (post_id=null, state='unread')
 * 6. Returns { queue_item_id, feed_item_id }
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { IngestRequest, IngestResponse, ErrorResponse } from '@brainheal/shared';

export const app = new Hono().basePath('/ingest');

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates a URL string: must parse as a valid URL with http/https scheme.
 */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitizes text input: trims whitespace and removes control characters.
 */
export function sanitizeText(value: string): string {
  // Remove control characters (except newlines and tabs which may be intentional)
  // deno-lint-ignore no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Validates the ingest request body.
 * Returns a sanitized { type, value } or throws with an error message.
 */
export function validateIngestBody(body: unknown): IngestRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be a JSON object');
  }

  const { type, value } = body as Record<string, unknown>;

  if (type !== 'url' && type !== 'text') {
    throw new Error('Field "type" must be "url" or "text"');
  }

  if (typeof value !== 'string') {
    throw new Error('Field "value" must be a string');
  }

  if (type === 'url') {
    const trimmed = value.trim();
    if (!isValidUrl(trimmed)) {
      throw new Error('Invalid URL: must be a valid http/https URL');
    }
    return { type: 'url', value: trimmed };
  }

  // type === 'text'
  const sanitized = sanitizeText(value);
  if (sanitized.length < 3) {
    throw new Error('Text input must be at least 3 characters');
  }
  if (sanitized.length > 10_000) {
    throw new Error('Text input must not exceed 10,000 characters');
  }
  return { type: 'text', value: sanitized };
}

// ---------------------------------------------------------------------------
// Route: POST /
// ---------------------------------------------------------------------------

app.post('/', async (c: Context) => {
  // ---- 1. Auth ----
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' } satisfies ErrorResponse, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.error('Missing Supabase environment variables');
    return c.json({ error: 'Server configuration error' } satisfies ErrorResponse, 500);
  }

  // Create user-context client to validate JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return c.json({ error: 'Unauthorized' } satisfies ErrorResponse, 401);
  }

  // ---- 2. Parse and validate body ----
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' } satisfies ErrorResponse, 400);
  }

  let validated: IngestRequest;
  try {
    validated = validateIngestBody(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return c.json({ error: message } satisfies ErrorResponse, 400);
  }

  // ---- 3. Insert queue_item and feed_item (using service_role to bypass RLS) ----
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Insert queue_item
  const { data: queueItem, error: queueError } = await adminClient
    .from('queue_items')
    .insert({
      user_id: user.id,
      input_type: validated.type,
      input_value: validated.value,
      status: 'pending',
      retry_count: 0,
    })
    .select('id')
    .single();

  if (queueError || !queueItem) {
    console.error('Failed to insert queue_item:', queueError);
    return c.json({ error: 'Failed to create queue item' } satisfies ErrorResponse, 500);
  }

  // Compute next feed position: MAX(position) + 1 for this user
  const { data: posData, error: posError } = await adminClient
    .from('feed_items')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (posError) {
    console.error('Failed to query max feed position:', posError);
    return c.json({ error: 'Failed to compute feed position' } satisfies ErrorResponse, 500);
  }

  const nextPosition = posData ? (posData.position as number) + 1 : 1;

  // Insert feed_item with post_id=null (skeleton state)
  const { data: feedItem, error: feedError } = await adminClient
    .from('feed_items')
    .insert({
      user_id: user.id,
      post_id: null,
      queue_item_id: queueItem.id,
      position: nextPosition,
      state: 'unread',
      source_type: 'self',
    })
    .select('id')
    .single();

  if (feedError || !feedItem) {
    console.error('Failed to insert feed_item:', feedError);
    // Attempt to clean up the queue_item we just created
    await adminClient.from('queue_items').delete().eq('id', queueItem.id);
    return c.json({ error: 'Failed to create feed item' } satisfies ErrorResponse, 500);
  }

  // ---- 4. Return 202 ----
  const response: IngestResponse = {
    queue_item_id: queueItem.id,
    feed_item_id: feedItem.id,
  };
  return c.json(response, 202);
});

// Health check
app.get('/health', (c: Context) => c.json({ status: 'ok' }));
