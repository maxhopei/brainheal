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

import { createClient } from '@supabase/supabase-js'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { validator } from 'hono/validator'

import { Logger } from '@brainheal/logging'
import { Accountant, createLLMProvider, type LLMProvider } from '@brainheal/ingestion'
import { BillingRepository, ContentRepository, IngestionQueue } from '@brainheal/storage'

import { Processor } from './processor.ts'
import { config } from './config.ts'
import z from 'zod/v4'

const adminSupabaseClient = createClient(config.supabase.url, config.supabase.serviceRoleKey)
const createUserSupabaseClient = (authHeader: string) =>
  createClient(
    config.supabase.url,
    config.supabase.publishableKey,
    { global: { headers: { Authorization: authHeader } } },
  )

const ingestionQueue = new IngestionQueue(adminSupabaseClient)

let accountant: Accountant | null = null
let processor: Processor | null = null

if (config.billing) {
  accountant = new Accountant(adminSupabaseClient, {
    free: config.billing.freeMonthlyBudgetUsd,
    paid: config.billing.paidMonthlyBudgetUsd,
  })
}

if (config.llm) {
  const llmProvider: LLMProvider = config.llm.provider === 'bedrock'
    ? createLLMProvider(config.llm.provider, config.llm.model, {
      accessKeyId: config.llm.aws.accessKeyId!,
      secretAccessKey: config.llm.aws.secretAccessKey!,
      region: config.llm.aws.region!,
    })
    : createLLMProvider(config.llm.provider, config.llm.model, config.llm.apiKey!)

  processor = new Processor(
    llmProvider,
    new ContentRepository(adminSupabaseClient),
    new BillingRepository(adminSupabaseClient),
  )
}

const ingestRequestSchema = z.object({
  type: z.enum(['url', 'text']),
  value: z.string().nonempty(),
})

export type IngestResponse = {
  queue_item_id: string
  feed_item_id: string
}

export type ErrorResponse = {
  error: string
}

export const app = new Hono().basePath('/ingest')

app.use(
  '/*',
  cors({
    origin: ['https://brain-heal.netlify.app', 'http://localhost:3000'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    maxAge: 600,
    credentials: true,
  }),
)

app.post(
  '/',
  validator('json', (value, c) => {
    const result = ingestRequestSchema.safeParse(value)
    if (!result.success) {
      return c.json({ error: 'Invalid request', details: z.treeifyError(result.error) }, 400)
    }
    return result.data
  }),
  async (c) => {
    const logger = Logger.create('Ingest Function')

    // ---- 1. Auth ----
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Missing Authorization header' } satisfies ErrorResponse, 401)
    }

    // Create user-context client to validate JWT
    const userClient = createUserSupabaseClient(authHeader)

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' } satisfies ErrorResponse, 401)
    }

    logger.addProps({ userId: user.id })

    // ---- 2. Get ingestion request ----
    const request = c.req.valid('json')

    try {
      // ---- 3. Insert queue_item and feed_item (using service_role to bypass RLS) ----
      const { queueItemId, feedItemId } = await ingestionQueue.addItem(
        user.id,
        request.type,
        request.value,
        config.ingestionMode === 'immediate' ? 'processing' : 'pending',
      )

      logger.addProps({ queueItemId, feedItemId })

      // ---- 4. Return 202 (and optionally process in background) ----
      if (config.ingestionMode === 'immediate' && accountant && processor) {
        // Process in background (non-blocking)
        void (async () => {
          // Check budget (non-blocking — log only)
          try {
            const budgetCheck = await accountant.checkDailyBudget(user.id)
            if (!budgetCheck.allowed) {
              logger.withProps(budgetCheck).warning('User over daily budget, but processing anyway (immediate mode)')
            }
          } catch (err) {
            logger.withException(err).warning('Budget check failed (non-fatal in immediate mode)')
          }

          // Process the item
          try {
            await processor.processItem(user.id, queueItemId, request.type, request.value)
            await ingestionQueue.markItemCompleted(queueItemId)
            logger.debug('Queue item completed')
          } catch (err) {
            logger.withException(err).error('Background processing failed')
            const errorMessage = err instanceof Error ? err.message : 'Processing failed with unknown error'
            await ingestionQueue.markItemFailed(queueItemId, errorMessage)
          }
        })()
      }

      return c.json(
        {
          queue_item_id: queueItemId,
          feed_item_id: feedItemId,
        } satisfies IngestResponse,
        202,
      )
    } catch (error) {
      logger.withException(error).error('Failed to process ingestion request')
      return c.json({ error: 'Failed to process ingestion request' } satisfies ErrorResponse, 500)
    }
  },
)

// Health check
app.get('/health', (c: Context) =>
  c.json({
    status: 'ok',
    ingestion_mode: config.ingestionMode,
  }))
