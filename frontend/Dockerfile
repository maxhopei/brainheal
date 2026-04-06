# Stage 1: build the React + Vite PWA
# Build context: repo root (set in compose.yaml)
FROM denoland/deno:2.2.2 AS builder

WORKDIR /app

# Copy all workspace member deno.json files for Deno workspace resolution
COPY deno.json ./
COPY packages/shared/deno.json ./packages/shared/
COPY worker/deno.json ./worker/
COPY supabase/functions/ingest/deno.json ./supabase/functions/ingest/
COPY supabase/functions/stripe-webhook/deno.json ./supabase/functions/stripe-webhook/
COPY frontend/deno.json ./frontend/

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY frontend/ ./frontend/

WORKDIR /app/frontend

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

RUN deno task build

# Stage 2: serve the built app with nginx
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
