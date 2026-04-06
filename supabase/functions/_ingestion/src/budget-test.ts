/**
 * Tests for budget.ts — daily cost budget enforcement.
 * Uses mock Supabase clients to avoid needing a live database.
 */

import { assertEquals, assertRejects } from '@std/assert'
import { Accountant } from './budget.ts'

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock Supabase client that returns preset data for each
 * table query. cost_records is queried twice: first for the monthly total,
 * then for today's total.
 */
function mockSupabase(config: {
  profile?: { billing_tier: string } | null
  profileError?: { message: string }
  monthlyRecords?: Array<{ cost_usd: number }>
  monthlyError?: { message: string }
  todayRecords?: Array<{ cost_usd: number }>
  todayError?: { message: string }
  // deno-lint-ignore no-explicit-any
}): any {
  let costCallCount = 0

  const makeChain = (table: string) => {
    // deno-lint-ignore no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      single: () => chain,
      then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
        if (table === 'profiles') {
          return Promise.resolve(
            resolve({
              data: config.profileError ? null : (config.profile ?? null),
              error: config.profileError ?? null,
            }),
          )
        }

        // cost_records — first call is monthly, second is today
        costCallCount++
        if (costCallCount === 1) {
          return Promise.resolve(
            resolve({
              data: config.monthlyError ? null : (config.monthlyRecords ?? []),
              error: config.monthlyError ?? null,
            }),
          )
        }
        return Promise.resolve(
          resolve({
            data: config.todayError ? null : (config.todayRecords ?? []),
            error: config.todayError ?? null,
          }),
        )
      },
    }

    return chain
  }

  return {
    from: (table: string) => makeChain(table),
  }
}

const accountant = new Accountant({
  free: 1.00,
  paid: 10.00,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test('checkDailyBudget - allowed when no costs this month (free tier)', async () => {
  const supabase = mockSupabase({
    profile: { billing_tier: 'free' },
    monthlyRecords: [],
    todayRecords: [],
  })
  const result = await accountant.checkDailyBudget(supabase, 'user-1')
  assertEquals(result.allowed, true)
})

Deno.test('checkDailyBudget - allowed when no costs today but some this month (free tier)', async () => {
  const supabase = mockSupabase({
    profile: { billing_tier: 'free' },
    monthlyRecords: [{ cost_usd: 0.10 }],
    todayRecords: [],
  })
  const result = await accountant.checkDailyBudget(supabase, 'user-1')
  assertEquals(result.allowed, true)
})

Deno.test('checkDailyBudget - not allowed when monthly budget exceeded (free tier)', async () => {
  // Free tier: $1.00/month. Already spent $1.50 this month.
  const supabase = mockSupabase({
    profile: { billing_tier: 'free' },
    monthlyRecords: [{ cost_usd: 0.75 }, { cost_usd: 0.75 }],
    todayRecords: [],
  })
  const result = await accountant.checkDailyBudget(supabase, 'user-1')
  assertEquals(result.allowed, false)
})

Deno.test('checkDailyBudget - allowed for paid tier with plenty of budget remaining', async () => {
  // Paid tier: $10.00/month. Spent $2.00 this month, $0.10 today.
  const supabase = mockSupabase({
    profile: { billing_tier: 'paid' },
    monthlyRecords: [{ cost_usd: 2.00 }],
    todayRecords: [{ cost_usd: 0.10 }],
  })
  const result = await accountant.checkDailyBudget(supabase, 'user-1')
  assertEquals(result.allowed, true)
})

Deno.test('checkDailyBudget - result includes expected fields', async () => {
  const supabase = mockSupabase({
    profile: { billing_tier: 'paid' },
    monthlyRecords: [{ cost_usd: 1.00 }],
    todayRecords: [{ cost_usd: 0.05 }],
  })
  const result = await accountant.checkDailyBudget(supabase, 'user-1')
  assertEquals(typeof result.allowed, 'boolean')
  assertEquals(typeof result.dailyLimit, 'number')
  assertEquals(typeof result.todaySpend, 'number')
  assertEquals(typeof result.monthlySpend, 'number')
  assertEquals(typeof result.monthlyBudget, 'number')
  assertEquals(typeof result.remainingDays, 'number')
  assertEquals(result.monthlySpend, 1.00)
  assertEquals(result.todaySpend, 0.05)
})

Deno.test('checkDailyBudget - throws when profile cannot be read', async () => {
  const supabase = mockSupabase({
    profileError: { message: 'Database error' },
    monthlyRecords: [],
    todayRecords: [],
  })
  await assertRejects(
    () => accountant.checkDailyBudget(supabase, 'user-1'),
    Error,
    'Failed to fetch profile',
  )
})

Deno.test('checkDailyBudget - throws when monthly cost query fails', async () => {
  const supabase = mockSupabase({
    profile: { billing_tier: 'free' },
    monthlyError: { message: 'Database error' },
    todayRecords: [],
  })
  await assertRejects(
    () => accountant.checkDailyBudget(supabase, 'user-1'),
    Error,
    'Failed to fetch monthly costs',
  )
})

Deno.test('checkDailyBudget - throws when today cost query fails', async () => {
  const supabase = mockSupabase({
    profile: { billing_tier: 'free' },
    monthlyRecords: [],
    todayError: { message: 'Database error' },
  })
  await assertRejects(
    () => accountant.checkDailyBudget(supabase, 'user-1'),
    Error,
    "Failed to fetch today's costs",
  )
})
