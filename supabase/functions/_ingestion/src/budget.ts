/**
 * Daily LLM cost budget enforcement.
 *
 * Computes per-user daily limits based on their billing tier and
 * their spending this month. The worker calls checkDailyBudget()
 * before each processing job.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillingTier } from '@brainheal/shared'

export type BudgetCheckResult = {
  allowed: boolean
  dailyLimit: number
  todaySpend: number
  monthlySpend: number
  monthlyBudget: number
  remainingDays: number
}

export type TieredBudget = {
  free: number
  paid: number
}

export class Accountant {
  constructor(private readonly tieredBudget: TieredBudget) {
  }

  public async checkDailyBudget(
    supabase: SupabaseClient,
    userId: string,
  ): Promise<BudgetCheckResult> {
    // 1. Get billing tier
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('billing_tier')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      throw new Error(
        `Failed to fetch profile for user ${userId}: ${profileError?.message}`,
      )
    }

    const tier = (profile.billing_tier as BillingTier) ?? 'free'
    const monthlyBudget = this.getMonthlyBudget(tier)

    // 2. Get monthly spend
    const monthStart = this.startOfCurrentMonthUtc()
    const { data: monthlyRecords, error: monthlyError } = await supabase
      .from('cost_records')
      .select('cost_usd')
      .eq('user_id', userId)
      .gte('created_at', monthStart)

    if (monthlyError) {
      throw new Error(
        `Failed to fetch monthly costs for user ${userId}: ${monthlyError.message}`,
      )
    }

    const monthlySpend = (monthlyRecords ?? []).reduce(
      (sum: number, r: { cost_usd: number }) => sum + Number(r.cost_usd),
      0,
    )

    // 3. Compute daily limit
    const remainingDays = this.remainingDaysInMonth()
    const remainingBudget = Math.max(monthlyBudget - monthlySpend, 0)
    const dailyLimit = remainingBudget / remainingDays

    // 4. Get today's spend
    const todayStart = this.startOfTodayUtc()
    const { data: todayRecords, error: todayError } = await supabase
      .from('cost_records')
      .select('cost_usd')
      .eq('user_id', userId)
      .gte('created_at', todayStart)

    if (todayError) {
      throw new Error(
        `Failed to fetch today's costs for user ${userId}: ${todayError.message}`,
      )
    }

    const todaySpend = (todayRecords ?? []).reduce(
      (sum: number, r: { cost_usd: number }) => sum + Number(r.cost_usd),
      0,
    )

    const allowed = todaySpend < dailyLimit

    return {
      allowed,
      dailyLimit,
      todaySpend,
      monthlySpend,
      monthlyBudget,
      remainingDays,
    }
  }

  private getMonthlyBudget(tier: keyof TieredBudget): number {
    return this.tieredBudget[tier] ?? 'free'
  }

  /**
   * Returns the number of days remaining in the current calendar month,
   * including today (minimum 1 to avoid division by zero).
   */
  private remainingDaysInMonth(): number {
    const now = new Date()
    const lastDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate()
    const remaining = lastDay - now.getUTCDate() + 1
    return Math.max(remaining, 1)
  }

  /**
   * Returns the start of today in UTC as an ISO string.
   */
  private startOfTodayUtc(): string {
    const now = new Date()
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString()
  }

  /**
   * Returns the start of the current calendar month in UTC as an ISO string.
   */
  private startOfCurrentMonthUtc(): string {
    const now = new Date()
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString()
  }
}
