# @brainheal/fn-stripe-webhook

Supabase Edge Function — Stripe billing webhook handler (Phase 2).

Handles Stripe subscription lifecycle events and updates `profiles.billing_tier` accordingly.

## Supported Events

| Event | Action |
|---|---|
| `checkout.session.completed` | Upgrade user to `paid` tier |
| `customer.subscription.updated` | Sync tier based on subscription status |
| `customer.subscription.deleted` | Downgrade user to `free` tier |

## Dependencies

Requires a running Supabase instance and a Stripe webhook secret.

## Environment Setup

```bash
cp .env.example .env
```

Then edit `.env` and set `STRIPE_WEBHOOK_SECRET` to your Stripe webhook signing secret.

## Running Locally

From the repo root:

```bash
deno task fn:stripe-webhook
```

## Deploying

```bash
supabase functions deploy stripe-webhook
```
