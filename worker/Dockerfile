FROM denoland/deno:2.2.2

WORKDIR /app

# Cache dependencies first (better layer caching)
COPY worker/deno.json ./worker/
COPY packages/shared/ ./packages/shared/
COPY deno.json ./

# Copy worker source files
COPY worker/main.ts ./worker/
COPY worker/processor.ts ./worker/
COPY worker/llm.ts ./worker/
COPY worker/fetcher.ts ./worker/
COPY worker/budget.ts ./worker/

# Cache all dependencies
RUN deno cache ./worker/main.ts

# Run as non-root
USER deno

WORKDIR /app/worker

CMD ["deno", "run", "--allow-all", "main.ts"]
