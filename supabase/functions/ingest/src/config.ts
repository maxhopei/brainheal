import { z } from 'zod/v4'

const configSchema = z.object({
  SUPABASE_URL: z.string()
    .nonempty()
    .describe('Supabase project URL, e.g. https://xyzcompany.supabase.co'),
  PUBLISHABLE_DEFAULT_KEY: z.string()
    .optional()
    .describe('Supabase publishable default key (for non-sensitive operations, e.g. health checks)'),
  SUPABASE_ANON_KEY: z.string()
    .optional()
    .describe('Supabase anon key (legacy) (for non-sensitive operations, e.g. health checks)'),
  SUPABASE_SERVICE_ROLE_KEY: z.string()
    .nonempty()
    .describe('Supabase service role key (for ingestion operations, bypasses RLS)'),
  INGESTION_MODE: z.enum(['immediate', 'deferred'])
    .default('immediate')
    .describe('Determines whether ingestion should be performed immediately or deferred.'),
  FREE_MONTHLY_BUDGET_USD: z.coerce
    .number()
    .positive()
    .default(1)
    .describe('Monthly budge in USD for the free tier'),
  PAID_MONTHLY_BUDGET_USD: z.coerce
    .number()
    .positive()
    .default(10)
    .describe('Monthly budge in USD for the paid tier'),
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'bedrock'])
    .describe('The LLM provider. Supported: openai, anthropic, bedrock.'),
  LLM_MODEL: z.string()
    .nonempty()
    .describe('The LLM name.'),
  LLM_API_KEY: z.string()
    .optional()
    .describe('API key for the LLM provider (not needed for Bedrock).'),
  AWS_ACCESS_KEY_ID: z.string()
    .optional()
    .describe('AWS access key ID (only needed if LLM_PROVIDER=bedrock).'),
  AWS_SECRET_ACCESS_KEY: z.string()
    .optional()
    .describe('AWS secret access key (only needed if LLM_PROVIDER=bedrock).'),
  AWS_REGION: z.string()
    .optional()
    .describe('AWS region (e.g. us-east-1, only needed if LLM_PROVIDER=bedrock).'),
})
  .refine(
    (data) => data.PUBLISHABLE_DEFAULT_KEY || data.SUPABASE_ANON_KEY,
    {
      message: 'Either PUBLISHABLE_DEFAULT_KEY or SUPABASE_ANON_KEY must be provided.',
    },
  )
  .refine(
    (data) => {
      if (data.LLM_PROVIDER === 'bedrock') {
        return (data.AWS_ACCESS_KEY_ID &&
          data.AWS_SECRET_ACCESS_KEY &&
          data.AWS_REGION)
      }
      return true
    },
    {
      message: 'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION are required for Bedrock.',
    },
  )
  .refine(
    (data) => {
      if (data.LLM_PROVIDER !== 'bedrock') {
        return !!data.LLM_API_KEY
      }
      return true
    },
    {
      message: 'LLM_API_KEY is required for non-Bedrock providers;',
    },
  )

const env = configSchema.parse(Deno.env.toObject())

console.log('Config', {
  supabase: {
    url: env.SUPABASE_URL,
    publishableKey: env.PUBLISHABLE_DEFAULT_KEY ?? env.SUPABASE_ANON_KEY,
    serviceRoleKey: '[redacted]',
  },
  ingestionMode: env.INGESTION_MODE,
  billing: {
    freeMonthlyBudgetUsd: env.FREE_MONTHLY_BUDGET_USD,
    paidMonthlyBudgetUsd: env.PAID_MONTHLY_BUDGET_USD,
  },
  llm: {
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
    apiKey: '[redacted]',
    aws: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: '[redacted]',
      region: env.AWS_REGION,
    },
  },
})

export const config = {
  supabase: {
    url: env.SUPABASE_URL,
    publishableKey: env.PUBLISHABLE_DEFAULT_KEY ?? env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  ingestionMode: env.INGESTION_MODE,
  billing: {
    freeMonthlyBudgetUsd: env.FREE_MONTHLY_BUDGET_USD,
    paidMonthlyBudgetUsd: env.PAID_MONTHLY_BUDGET_USD,
  },
  llm: {
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
    apiKey: env.LLM_API_KEY,
    aws: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_REGION,
    },
  },
}
