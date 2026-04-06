FROM denoland/deno:2.2.2

WORKDIR /app

# Copy all workspace member deno.json files for Deno workspace resolution
COPY deno.json ./
COPY supabase/functions/_shared/deno.json ./supabase/functions/_shared/
COPY worker/deno.json ./worker/
COPY supabase/functions/ingest/deno.json ./supabase/functions/ingest/
COPY supabase/functions/stripe-webhook/deno.json ./supabase/functions/stripe-webhook/
COPY frontend/deno.json ./frontend/

# Copy source files
COPY supabase/functions/_shared/ ./supabase/functions/_shared/
COPY worker/src/ ./worker/src/

# Cache all dependencies
RUN deno cache ./worker/src/main.ts

# Run as non-root
USER deno

WORKDIR /app/worker

CMD ["deno", "run", "--allow-all", "src/main.ts"]
