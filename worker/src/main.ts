/**
 * worker/src/main.ts — Entry point for the BrainHeal processing worker.
 *
 * Starts:
 * 1. The poll loop — periodically claims and processes queue items.
 * 2. A health check HTTP server on port 8080.
 *
 * Environment variables required (all providers):
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
 *   LLM_PROVIDER              — "openai" | "anthropic" | "bedrock"
 *
 * Additional variables for each provider:
 *   openai:
 *     LLM_API_KEY             — OpenAI API key
 *   anthropic:
 *     LLM_API_KEY             — Anthropic API key
 *   bedrock:
 *     AWS_ACCESS_KEY_ID       — AWS IAM access key
 *     AWS_SECRET_ACCESS_KEY   — AWS IAM secret key
 *     AWS_REGION              — AWS region (default: us-east-1)
 *
 * Optional for all providers:
 *   LLM_MODEL                 — Model name override (uses provider default if not set)
 *   POLL_INTERVAL_MS          — Queue poll interval in ms (default: 5000)
 *   HEALTH_PORT               — Health check server port (default: 8080)
 *   FREE_MONTHLY_BUDGET_USD   — Monthly LLM budget for free tier (default: 1.00)
 *   PAID_MONTHLY_BUDGET_USD   — Monthly LLM budget for paid tier (default: 10.00)
 */

import { createClient } from '@supabase/supabase-js'
import { Accountant, createLLMProvider } from '@brainheal/ingestion'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { processNextItem } from './processor.ts'
import { config } from './config.ts'

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  extra?: Record<string, unknown>,
): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...extra }))
}

// ---------------------------------------------------------------------------
// Initialize LLM provider (provider-specific env var validation)
// ---------------------------------------------------------------------------

function buildLLMProvider() {
  if (config.llm.provider === 'bedrock') {
    const bedrockCredentials = {
      accessKeyId: config.llm.aws.accessKeyId!,
      secretAccessKey: config.llm.aws.secretAccessKey!,
      region: config.llm.aws.region!,
    }
    return createLLMProvider(config.llm.provider, config.llm.model, bedrockCredentials)
  } else {
    return createLLMProvider(config.llm.provider, config.llm.model, config.llm.apiKey!)
  }
}

// ---------------------------------------------------------------------------
// Initialize clients
// ---------------------------------------------------------------------------

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const llm = buildLLMProvider()

const accountant = new Accountant({
  free: config.billing.freeMonthlyBudgetUsd,
  paid: config.billing.paidMonthlyBudgetUsd,
})

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let isProcessing = false
let isShuttingDown = false

async function pollLoop(): Promise<void> {
  if (isShuttingDown) return
  if (isProcessing) {
    log('info', 'Still processing previous item, skipping poll')
    return
  }

  isProcessing = true
  try {
    const processed = await processNextItem(supabase, llm, accountant)
    if (processed) {
      // If we processed something, immediately try again (drain the queue faster)
      setTimeout(pollLoop, 0)
    }
  } catch (err) {
    log('error', 'Unhandled error in poll loop', { error: String(err) })
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

log('info', `Health check server starting on port ${config.healthPort}`)

Deno.serve({ port: config.healthPort }, app.fetch)

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  log('info', `Received ${signal}, shutting down gracefully`)
  isShuttingDown = true
  clearInterval(pollInterval)

  // Wait for any in-progress job to finish (up to 30 seconds)
  const deadline = Date.now() + 30_000
  while (isProcessing && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (isProcessing) {
    log('warn', 'Graceful shutdown timeout — forcing exit')
  } else {
    log('info', 'Shutdown complete')
  }

  Deno.exit(0)
}

Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'))
Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'))
