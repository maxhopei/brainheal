import type { BillingRepository, ProfileRepository } from '@brainheal/storage'

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

/**
 * Daily LLM cost budget enforcement.
 *
 * Computes per-user daily limits based on their billing tier and
 * their spending this month. The worker calls checkDailyBudget()
 * before each processing job.
 */
export class Accountant {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly billingRepository: BillingRepository,
    private readonly tieredBudget: TieredBudget,
  ) {
  }

  public async checkDailyBudget(userId: string): Promise<BudgetCheckResult> {
    const now = new Date()

    // 1. Get billing tier
    const tier = await this.profileRepository.getBillingTier(userId)
    const monthlyBudget = this.getMonthlyBudget(tier)

    // 2. Get monthly spend
    const monthlySpend = await this.billingRepository.getMonthlySpend(userId, now)

    // 3. Compute daily limit
    const remainingDays = this.remainingDaysInMonth(now)
    const remainingBudget = Math.max(monthlyBudget - monthlySpend, 0)
    const dailyLimit = remainingBudget / remainingDays

    // 4. Get today's spend
    const todaySpend = await this.billingRepository.getDailySpend(userId, now)

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
    return this.tieredBudget[tier] ?? this.tieredBudget['free']
  }

  /**
   * Returns the number of days remaining in the current calendar month,
   * including today (minimum 1 to avoid division by zero).
   */
  private remainingDaysInMonth(anyDayInMonth: Date): number {
    const lastDay = new Date(
      Date.UTC(anyDayInMonth.getUTCFullYear(), anyDayInMonth.getUTCMonth() + 1, 0),
    ).getUTCDate()
    const remaining = lastDay - anyDayInMonth.getUTCDate() + 1
    return Math.max(remaining, 1)
  }
}
