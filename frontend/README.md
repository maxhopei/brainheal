# @brainheal/frontend

React + Vite PWA for BrainHeal. Mobile-first interface for browsing AI-generated swipeable card feeds.

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

The default `.env.example` is pre-configured for the local Supabase stack — no changes needed unless you're pointing at a remote project.

## Running Locally

```bash
deno task dev
```

Starts the Vite dev server at `http://localhost:3000`.

## Building for Production

```bash
deno task build    # outputs to dist/
deno task preview  # preview the production build locally
```

## Running in Docker

From the repo root:

```bash
deno task docker:start
```

The frontend is served as a static nginx build at `http://localhost:3000`.
