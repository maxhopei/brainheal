/**
 * supabase/functions/ingest/src/index.ts — Content ingestion Edge Function logic.
 *
 * POST /functions/v1/ingest
 * Body: { type: 'url' | 'text', value: string }
 * Returns: 202 { queue_item_id, feed_item_id } or 4xx { error: string }
 *
 * Supports two modes (controlled by INGESTION_MODE environment variable):
 * - "deferred" (default): Queue item only, worker processes asynchronously
 * - "immediate": Queue item + respond immediately + process in background
 *
 * This function:
 * 1. Validates the JWT (via supabase.auth.getUser())
 * 2. Validates the request body
 * 3. Inserts a queue_item (status='pending' or 'processing' depending on mode)
 * 4. Computes the next feed position
 * 5. Inserts a feed_item (post_id=null, state='unread')
 * 6. Returns { queue_item_id, feed_item_id }
 * 7. (Immediate mode only) Processes the item in the background
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IngestRequest, IngestResponse, ErrorResponse } from '@brainheal/shared';
import { createLLMProvider, type LLMProvider } from './llm.ts';
import { processItem } from './processor.ts';
import { checkDailyBudget } from './budget.ts';

export const app = new Hono().basePath('/ingest');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INGESTION_MODE = Deno.env.get('INGESTION_MODE') ?? 'deferred';

console.log('Ingestion mode:', INGESTION_MODE)

// LLM configuration (only needed for immediate mode)
let llmProvider: LLMProvider | null = null;

function initLLMProvider(): LLMProvider {
  if (llmProvider) return llmProvider;

  const provider = Deno.env.get('LLM_PROVIDER');
  const model = Deno.env.get('LLM_MODEL');

  if (!provider) {
    throw new Error('LLM_PROVIDER environment variable is required for immediate mode');
  }
  if (!model) {
    throw new Error('LLM_MODEL environment variable is required for immediate mode');
  }

  if (provider === 'bedrock') {
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Bedrock provider');
    }
  } else {
    const apiKey = Deno.env.get('LLM_API_KEY');
    if (!apiKey) {
      throw new Error('LLM_API_KEY environment variable is required for immediate mode');
    }
  }

  const apiKey = Deno.env.get('LLM_API_KEY') ?? '';
  llmProvider = createLLMProvider(provider, apiKey, model);
  return llmProvider;
}

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

  // Insert queue_item (status depends on mode)
  const initialStatus = INGESTION_MODE === 'immediate' ? 'processing' : 'pending';
  const { data: queueItem, error: queueError } = await adminClient
    .from('queue_items')
    .insert({
      user_id: user.id,
      input_type: validated.type,
      input_value: validated.value,
      status: initialStatus,
      retry_count: 0,
      started_at: INGESTION_MODE === 'immediate' ? new Date().toISOString() : null,
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

  // ---- 4. Return 202 (and optionally process in background) ----
  const response: IngestResponse = {
    queue_item_id: queueItem.id,
    feed_item_id: feedItem.id,
  };

  if (INGESTION_MODE === 'immediate') {
    // Process in background (non-blocking)
    processInBackground(adminClient, user.id, queueItem.id, validated).catch((err) => {
      console.error('Background processing failed:', err);
    });
  }

  return c.json(response, 202);
});

// ---------------------------------------------------------------------------
// Background processing (immediate mode only)
// ---------------------------------------------------------------------------

async function processInBackground(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  queueItemId: string,
  validated: IngestRequest,
): Promise<void> {
  const ctx = {
    queueItemId,
    userId,
    inputType: validated.type,
    inputValue: validated.value,
  };

  // Check budget (non-blocking — log only)
  try {
    const budgetCheck = await checkDailyBudget(supabase, userId);
    if (!budgetCheck.allowed) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'User over daily budget, but processing anyway (immediate mode)',
        queue_item_id: queueItemId,
        user_id: userId,
        daily_limit: budgetCheck.dailyLimit,
        today_spend: budgetCheck.todaySpend,
      }));
    }
  } catch (err) {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'Budget check failed (non-fatal in immediate mode)',
      queue_item_id: queueItemId,
      error: String(err),
    }));
  }

  // Initialize LLM provider
  let llm: LLMProvider;
  try {
    llm = initLLMProvider();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to initialize LLM provider',
      queue_item_id: queueItemId,
      error: errorMessage,
    }));

    await markItemFailed(supabase, queueItemId, errorMessage);
    return;
  }

  // Process the item
  try {
    await processItem(supabase, llm, ctx);

    // Mark completed
    await supabase
      .from('queue_items')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', queueItemId);

    console.log(JSON.stringify({
      level: 'info',
      message: 'Queue item completed',
      queue_item_id: queueItemId,
    }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      level: 'error',
      message: 'Processing failed',
      queue_item_id: queueItemId,
      error: errorMessage,
    }));

    await markItemFailed(supabase, queueItemId, errorMessage);
  }
}

async function markItemFailed(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  queueItemId: string,
  errorMessage: string,
): Promise<void> {
  // Mark queue item as failed
  await supabase
    .from('queue_items')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', queueItemId);

  // Update any associated post to failed status
  const { data: feedItem } = await supabase
    .from('feed_items')
    .select('post_id')
    .eq('queue_item_id', queueItemId)
    .maybeSingle();

  if (feedItem?.post_id) {
    await supabase
      .from('posts')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', feedItem.post_id);
  }
}

// Health check
app.get('/health', (c: Context) => c.json({
  status: 'ok',
  ingestion_mode: INGESTION_MODE,
}));
