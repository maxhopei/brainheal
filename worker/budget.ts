/**
 * worker/budget.ts — Daily LLM cost budget enforcement.
 *
 * Computes per-user daily limits based on their billing tier and
 * their spending this month. The worker calls checkDailyBudget()
 * before each processing job.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingTier } from '@brainheal/shared';

// Budget configuration — read from environment, with sensible defaults.
// These can be overridden by Fly.io secrets.
const FREE_MONTHLY_BUDGET_USD = parseFloat(
  Deno.env.get('FREE_MONTHLY_BUDGET_USD') ?? '1.00',
);
const PAID_MONTHLY_BUDGET_USD = parseFloat(
  Deno.env.get('PAID_MONTHLY_BUDGET_USD') ?? '10.00',
);

function getMonthlyBudget(tier: BillingTier): number {
  return tier === 'paid' ? PAID_MONTHLY_BUDGET_USD : FREE_MONTHLY_BUDGET_USD;
}

/**
 * Returns the number of days remaining in the current calendar month,
 * including today (minimum 1 to avoid division by zero).
 */
function remainingDaysInMonth(): number {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const remaining = lastDay - now.getUTCDate() + 1;
  return Math.max(remaining, 1);
}

/**
 * Returns the start of today in UTC as an ISO string.
 */
function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/**
 * Returns the start of the current calendar month in UTC as an ISO string.
 */
function startOfCurrentMonthUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

export type BudgetCheckResult = {
  allowed: boolean;
  dailyLimit: number;
  todaySpend: number;
  monthlySpend: number;
  monthlyBudget: number;
  remainingDays: number;
};

/**
 * Checks whether the user is within their daily LLM processing budget.
 *
 * Algorithm:
 *   remaining_budget = monthly_budget - sum(costs this month)
 *   daily_limit = remaining_budget / remaining_days_in_month
 *   allowed = sum(today's costs) < daily_limit
 */
export async function checkDailyBudget(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<BudgetCheckResult> {
  // 1. Get billing tier
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('billing_tier')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error(`Failed to fetch profile for user ${userId}: ${profileError?.message}`);
  }

  const tier = (profile.billing_tier as BillingTier) ?? 'free';
  const monthlyBudget = getMonthlyBudget(tier);

  // 2. Get monthly spend
  const monthStart = startOfCurrentMonthUtc();
  const { data: monthlyRecords, error: monthlyError } = await supabase
    .from('cost_records')
    .select('cost_usd')
    .eq('user_id', userId)
    .gte('created_at', monthStart);

  if (monthlyError) {
    throw new Error(`Failed to fetch monthly costs for user ${userId}: ${monthlyError.message}`);
  }

  const monthlySpend = (monthlyRecords ?? []).reduce(
    (sum: number, r: { cost_usd: number }) => sum + Number(r.cost_usd),
    0,
  );

  // 3. Compute daily limit
  const remainingDays = remainingDaysInMonth();
  const remainingBudget = Math.max(monthlyBudget - monthlySpend, 0);
  const dailyLimit = remainingBudget / remainingDays;

  // 4. Get today's spend
  const todayStart = startOfTodayUtc();
  const { data: todayRecords, error: todayError } = await supabase
    .from('cost_records')
    .select('cost_usd')
    .eq('user_id', userId)
    .gte('created_at', todayStart);

  if (todayError) {
    throw new Error(`Failed to fetch today's costs for user ${userId}: ${todayError.message}`);
  }

  const todaySpend = (todayRecords ?? []).reduce(
    (sum: number, r: { cost_usd: number }) => sum + Number(r.cost_usd),
    0,
  );

  const allowed = todaySpend < dailyLimit;

  return {
    allowed,
    dailyLimit,
    todaySpend,
    monthlySpend,
    monthlyBudget,
    remainingDays,
  };
}
