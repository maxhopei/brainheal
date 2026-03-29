/**
 * worker/main.ts — Entry point for the BrainHeal processing worker.
 *
 * Starts:
 * 1. The poll loop — periodically claims and processes queue items.
 * 2. A health check HTTP server on port 8080.
 *
 * Environment variables required:
 *   SUPABASE_URL             — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
 *   LLM_PROVIDER             — "openai" or "anthropic"
 *   LLM_API_KEY              — API key for the chosen provider
 *   LLM_MODEL                — (optional) Model name override
 *   POLL_INTERVAL_MS         — (optional) Queue poll interval in ms (default: 5000)
 *   FREE_MONTHLY_BUDGET_USD  — (optional) Monthly LLM budget for free tier (default: 1.00)
 *   PAID_MONTHLY_BUDGET_USD  — (optional) Monthly LLM budget for paid tier (default: 10.00)
 */

import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { createLLMProvider } from './llm.ts';
import { processNextItem } from './processor.ts';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Required environment variable "${name}" is not set.`);
  }
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const LLM_PROVIDER = requireEnv('LLM_PROVIDER');
const LLM_API_KEY = requireEnv('LLM_API_KEY');
const LLM_MODEL = Deno.env.get('LLM_MODEL');
const POLL_INTERVAL_MS = parseInt(Deno.env.get('POLL_INTERVAL_MS') ?? '5000', 10);
const HEALTH_PORT = parseInt(Deno.env.get('HEALTH_PORT') ?? '8080', 10);

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------

function log(level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...extra }));
}

// ---------------------------------------------------------------------------
// Initialize clients
// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const llm = createLLMProvider(LLM_PROVIDER, LLM_API_KEY, LLM_MODEL);

log('info', 'Worker starting', {
  llm_provider: LLM_PROVIDER,
  llm_model: LLM_MODEL ?? 'default',
  poll_interval_ms: POLL_INTERVAL_MS,
});

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let isProcessing = false;
let isShuttingDown = false;

async function pollLoop(): Promise<void> {
  if (isShuttingDown) return;
  if (isProcessing) {
    log('info', 'Still processing previous item, skipping poll');
    return;
  }

  isProcessing = true;
  try {
    const processed = await processNextItem(supabase, llm);
    if (processed) {
      // If we processed something, immediately try again (drain the queue faster)
      setTimeout(pollLoop, 0);
    }
  } catch (err) {
    log('error', 'Unhandled error in poll loop', { error: String(err) });
  } finally {
    isProcessing = false;
  }
}

const pollInterval = setInterval(pollLoop, POLL_INTERVAL_MS);

// Trigger first poll immediately on startup
setTimeout(pollLoop, 1_000);

// ---------------------------------------------------------------------------
// Health check HTTP server
// ---------------------------------------------------------------------------

const app = new Hono();

app.get('/health', (c: Context) => {
  return c.json({
    status: 'ok',
    uptime_seconds: Math.floor(performance.now() / 1000),
    llm_provider: LLM_PROVIDER,
    poll_interval_ms: POLL_INTERVAL_MS,
    is_processing: isProcessing,
    is_shutting_down: isShuttingDown,
  });
});

app.get('/', (c: Context) => c.text('BrainHeal Worker'));

log('info', `Health check server starting on port ${HEALTH_PORT}`);

Deno.serve({ port: HEALTH_PORT }, app.fetch);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  log('info', `Received ${signal}, shutting down gracefully`);
  isShuttingDown = true;
  clearInterval(pollInterval);

  // Wait for any in-progress job to finish (up to 30 seconds)
  const deadline = Date.now() + 30_000;
  while (isProcessing && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (isProcessing) {
    log('warn', 'Graceful shutdown timeout — forcing exit');
  } else {
    log('info', 'Shutdown complete');
  }

  Deno.exit(0);
}

Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'));
Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'));
