# @brainheal/worker

Always-on Deno worker deployed to Fly.io. Polls the Supabase queue, fetches/researches content, calls an LLM, and writes structured card data back to the database.

## Dependencies

Requires a running Supabase instance. For local development, start it from the repo root:

```bash
deno task supabase:start
deno task supabase:migrate
```

Also requires an LLM API key (OpenAI, Anthropic, or AWS Bedrock credentials).

## Environment Setup

```bash
cp .env.example .env
```

Then edit `.env` and set the credentials for your chosen LLM provider. All other values are pre-configured for local Supabase.

### Provider-specific variables

| Provider | Required variables |
|---|---|
| `openai` | `LLM_API_KEY` — OpenAI API key |
| `anthropic` | `LLM_API_KEY` — Anthropic API key |
| `bedrock` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |

The AWS IAM user must have the `bedrock:InvokeModel` permission.

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

## Deploying to Fly.io

Set the required secrets for your chosen LLM provider:

### OpenAI

```bash
fly secrets set LLM_PROVIDER=openai
fly secrets set LLM_API_KEY=sk-...
```

### Anthropic

```bash
fly secrets set LLM_PROVIDER=anthropic
fly secrets set LLM_API_KEY=sk-ant-...
```

### AWS Bedrock

```bash
fly secrets set LLM_PROVIDER=bedrock
fly secrets set AWS_ACCESS_KEY_ID=AKIA...
fly secrets set AWS_SECRET_ACCESS_KEY=...
fly secrets set AWS_REGION=us-east-1
# Optional: override the default model (anthropic.claude-3-5-haiku-20241022-v1:0)
fly secrets set LLM_MODEL=anthropic.claude-3-5-haiku-20241022-v1:0
```

Bedrock uses the [Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) with AWS Signature Version 4 authentication. Any model available in your AWS account can be used via `LLM_MODEL`.

### Supabase secrets (required for all providers)

```bash
fly secrets set SUPABASE_URL=https://your-project.supabase.co
fly secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

