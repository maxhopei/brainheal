/**
 * Entry point for the BrainHeal processing worker.
 *
 * Starts:
 * 1. The poll loop — periodically claims and processes queue items.
 * 2. A health check HTTP server on port 8080.
 */

import { createClient } from '@supabase/supabase-js'
import { type Context, Hono } from 'hono'

import { Logger } from '@brainheal/logging'
import { Accountant, createLLMProvider, type LLMProvider, Processor, QueueConsumer } from '@brainheal/ingestion'
import { BillingRepository, ContentRepository, IngestionQueue, ProfileRepository } from '@brainheal/storage'

import { config } from './config.ts'

const logger = Logger.create('worker')

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const llmProvider: LLMProvider = config.llm.provider === 'bedrock'
  ? createLLMProvider(config.llm.provider, config.llm.model, {
    accessKeyId: config.llm.aws.accessKeyId!,
    secretAccessKey: config.llm.aws.secretAccessKey!,
    region: config.llm.aws.region!,
  })
  : createLLMProvider(config.llm.provider, config.llm.model, config.llm.apiKey!)

const profileRepository = new ProfileRepository(supabase)
const billingRepository = new BillingRepository(supabase)
const contentRepository = new ContentRepository(supabase)
const ingestionQueue = new IngestionQueue(supabase)

const accountant = new Accountant(
  profileRepository,
  billingRepository,
  {
    free: config.billing.freeMonthlyBudgetUsd,
    paid: config.billing.paidMonthlyBudgetUsd,
  },
)
const processor = new Processor(llmProvider, contentRepository, billingRepository)
const queueConsumer = new QueueConsumer(ingestionQueue, accountant, processor, { maxRetries: 3 })

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let isProcessing = false
let isShuttingDown = false

async function pollLoop(): Promise<void> {
  if (isShuttingDown) return
  if (isProcessing) {
    logger.debug('Still processing previous item, skipping poll')
    return
  }

  isProcessing = true
  try {
    const processed = await queueConsumer.processNextItem()
    if (processed) {
      // If we processed something, immediately try again (drain the queue faster)
      setTimeout(pollLoop, 0)
    }
  } catch (err) {
    logger.withException(err).error('Unhandled error in poll loop')
  } finally {
    isProcessing = false
  }
}

const pollInterval = setInterval(pollLoop, config.pollIntervalMs)

// Trigger first poll immediately on startup
setTimeout(pollLoop, 1_000)

// ---------------------------------------------------------------------------
// Health check HTTP server
// ---------------------------------------------------------------------------

const app = new Hono()

app.get('/health', (c: Context) => {
  return c.json({
    status: 'ok',
    uptime_seconds: Math.floor(performance.now() / 1000),
    llm_provider: config.llm.provider,
    poll_interval_ms: config.pollIntervalMs,
    is_processing: isProcessing,
    is_shutting_down: isShuttingDown,
  })
})

app.get('/', (c: Context) => c.text('BrainHeal Worker'))

logger.info(`Health check server starting on port ${config.healthPort}`)

Deno.serve({ port: config.healthPort }, app.fetch)

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`)
  isShuttingDown = true
  clearInterval(pollInterval)

  // Wait for any in-progress job to finish (up to 30 seconds)
  const deadline = Date.now() + 30_000
  while (isProcessing && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (isProcessing) {
    logger.warning('Graceful shutdown timeout — forcing exit')
  } else {
    logger.info('Shutdown complete')
  }

  Deno.exit(0)
}

Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'))
Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'))
