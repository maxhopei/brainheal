/**
 * supabase/functions/stripe-webhook/index.ts — Entry point shim.
 *
 * Core logic lives in src/index.ts. This file is kept at the function root
 * because Supabase Edge Functions require the entry point to be index.ts.
 */

import { app } from './src/index.ts';

Deno.serve(app.fetch);
