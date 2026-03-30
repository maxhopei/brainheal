/**
 * supabase/functions/stripe-webhook/src/index.ts — Stripe billing webhook handler logic.
 *
 * Phase 2 feature. Handles Stripe subscription events and updates
 * the user's billing_tier in the profiles table.
 *
 * Supported events:
 *   - checkout.session.completed    → upgrade to 'paid'
 *   - customer.subscription.updated → sync tier changes
 *   - customer.subscription.deleted → downgrade to 'free'
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';

export const app = new Hono();

// ---------------------------------------------------------------------------
// Stripe signature verification
// ---------------------------------------------------------------------------

/**
 * Computes HMAC-SHA256 signature to verify Stripe webhook authenticity.
 * Implements the Stripe signature verification protocol.
 */
async function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const parts = signature.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const v1Part = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !v1Part) return false;

  const timestamp = timestampPart.slice(2);
  const expectedSig = v1Part.slice(3);

  const signedPayload = `${timestamp}.${rawBody}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return sigHex === expectedSig;
}

// ---------------------------------------------------------------------------
// Route: POST / — Stripe webhook receiver
// ---------------------------------------------------------------------------

app.post('/', async (c: Context) => {
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!webhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing required environment variables');
    return c.json({ error: 'Server configuration error' }, 500);
  }

  // 1. Verify Stripe signature
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing Stripe-Signature header' }, 400);
  }

  const rawBody = await c.req.text();

  const isValid = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 400);
  }

  // 2. Parse the event
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const eventType = event['type'] as string;
  const eventData = (event['data'] as Record<string, unknown>)?.['object'] as Record<string, unknown>;

  if (!eventData) {
    return c.json({ received: true });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // 3. Handle relevant events
  try {
    switch (eventType) {
      case 'checkout.session.completed': {
        // User completed checkout — upgrade to paid tier
        // The customer's email is used to find the profile
        const customerEmail = eventData['customer_email'] as string | undefined;
        const customerId = eventData['customer'] as string | undefined;

        if (customerEmail) {
          await updateBillingTierByEmail(supabase, customerEmail, 'paid');
        } else if (customerId) {
          await updateBillingTierByStripeCustomerId(supabase, customerId, 'paid');
        }
        break;
      }

      case 'customer.subscription.updated': {
        const status = eventData['status'] as string;
        const customerId = eventData['customer'] as string;
        const tier = status === 'active' || status === 'trialing' ? 'paid' : 'free';
        if (customerId) {
          await updateBillingTierByStripeCustomerId(supabase, customerId, tier);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        // Subscription cancelled — downgrade to free
        const customerId = eventData['customer'] as string;
        if (customerId) {
          await updateBillingTierByStripeCustomerId(supabase, customerId, 'free');
        }
        break;
      }

      default:
        // Ignore other events
        console.log(`Unhandled Stripe event type: ${eventType}`);
    }
  } catch (err) {
    console.error('Error handling Stripe event:', err);
    return c.json({ error: 'Failed to process event' }, 500);
  }

  return c.json({ received: true });
});

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function updateBillingTierByEmail(supabase: any, email: string, tier: 'free' | 'paid'): Promise<void> {
  // Look up user by email via auth.users (requires service_role)
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error(`Failed to list users: ${error.message}`);

  // deno-lint-ignore no-explicit-any
  const user = users?.users?.find((u: any) => u.email === email);
  if (!user) {
    console.warn(`No user found with email: ${email}`);
    return;
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ billing_tier: tier })
    .eq('id', user.id);

  if (updateError) throw new Error(`Failed to update billing tier: ${updateError.message}`);

  console.log(`Updated billing tier for user ${user.id} to ${tier}`);
}

// deno-lint-ignore no-explicit-any
async function updateBillingTierByStripeCustomerId(supabase: any, _customerId: string, tier: 'free' | 'paid'): Promise<void> {
  // TODO Phase 2: Store stripe_customer_id in profiles table and look up by it.
  // For now, log a warning since we don't have the customer ID → user ID mapping yet.
  console.warn(`stripe_customer_id lookup not yet implemented. tier=${tier}`);
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (c: Context) => c.json({ status: 'ok' }));
