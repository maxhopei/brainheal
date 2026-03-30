# @brainheal/worker

Always-on Deno worker deployed to Fly.io. Polls the Supabase queue, fetches/researches content, calls an LLM, and writes structured card data back to the database.

## Dependencies

Requires a running Supabase instance. For local development, start it from the repo root:

```bash
deno task supabase:start
deno task supabase:migrate
```

Also requires an LLM API key (OpenAI or Anthropic).

## Environment Setup

```bash
cp .env.example .env
```

Then edit `.env` and set `LLM_API_KEY` to your OpenAI or Anthropic API key. All other values are pre-configured for local Supabase.

## Running Locally

```bash
deno task dev
```

Runs the worker with `--watch` for automatic restarts on file changes.

## Running in Docker

From the repo root:

```bash
deno task docker:start
```

The worker exposes a health check endpoint at `http://localhost:8080/health`.

## Running Tests

```bash
deno test --allow-all worker/
```
