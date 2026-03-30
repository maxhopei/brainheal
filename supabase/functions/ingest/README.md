# @brainheal/fn-ingest

Supabase Edge Function — content ingestion API.

Accepts a URL or free-text topic from the authenticated user, creates a queue item and a skeleton feed item, then returns immediately. The worker processes the queue asynchronously.

## API

```
POST /functions/v1/ingest
Authorization: Bearer <jwt>
Content-Type: application/json

{ "type": "url" | "text", "value": string }

→ 202 { queue_item_id, feed_item_id }
```

## Dependencies

Requires a running Supabase instance. For local development, start it from the repo root:

```bash
deno task supabase:start
deno task supabase:migrate
```

## Environment Setup

```bash
cp .env.example .env
```

The default `.env.example` is pre-configured for the local Supabase stack.

## Running Locally

From the repo root:

```bash
deno task fn:ingest
```

## Deploying

```bash
supabase functions deploy ingest
```

## Running Tests

```bash
deno test --allow-all supabase/functions/ingest/
```
