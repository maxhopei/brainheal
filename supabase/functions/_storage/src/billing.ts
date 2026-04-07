import type { SupabaseClient } from '@supabase/supabase-js'
import type { LLMUsage } from '@brainheal/ingestion'

/**
 * Cost record (matches cost_records table)
 */
export type CostRecord = {
  id: string
  user_id: string
  queue_item_id: string
  tokens_input: number
  tokens_output: number
  cost_usd: number
  model_used: string
  created_at: string
}

export class BillingRepository {
  constructor(private readonly supabase: SupabaseClient) {
  }

  public async getMonthlySpend(userId: string, now: Date): Promise<number> {
    const { data: monthlyRecords, error: monthlyError } = await this.supabase
      .from('cost_records')
      .select('cost_usd')
      .eq('user_id', userId)
      .gte('created_at', this.startOfCurrentMonthUtc(now))

    if (monthlyError) {
      throw new Error(
        `Failed to fetch monthly costs for user ${userId}: ${monthlyError.message}`,
      )
    }

    return (monthlyRecords ?? []).reduce(
      (sum: number, r: { cost_usd: number }) => sum + Number(r.cost_usd),
      0,
    )
  }

  public async getDailySpend(userId: string, now: Date): Promise<number> {
    const { data: todayRecords, error: todayError } = await this.supabase
      .from('cost_records')
      .select('cost_usd')
      .eq('user_id', userId)
      .gte('created_at', this.startOfDayUtc(now))

    if (todayError) {
      throw new Error(
        `Failed to fetch today's costs for user ${userId}: ${todayError.message}`,
      )
    }

    return (todayRecords ?? []).reduce(
      (sum: number, r: { cost_usd: number }) => sum + Number(r.cost_usd),
      0,
    )
  }

  public async recordUsage(userId: string, queueItemId: string, usage: LLMUsage) {
    const { error: costError } = await this.supabase
      .from('cost_records')
      .insert({
        user_id: userId,
        queue_item_id: queueItemId,
        tokens_input: usage.tokens_input,
        tokens_output: usage.tokens_output,
        cost_usd: usage.cost_usd,
        model_used: usage.model_used,
      })

    if (costError) {
      throw costError
    }
  }

  /**
   * Returns the start of today in UTC as an ISO string.
   */
  private startOfDayUtc(anyTimeOfDay: Date): string {
    return new Date(
      Date.UTC(anyTimeOfDay.getUTCFullYear(), anyTimeOfDay.getUTCMonth(), anyTimeOfDay.getUTCDate()),
    ).toISOString()
  }

  /**
   * Returns the start of the current calendar month in UTC as an ISO string.
   */
  private startOfCurrentMonthUtc(anyDayOfMonth: Date): string {
    return new Date(
      Date.UTC(anyDayOfMonth.getUTCFullYear(), anyDayOfMonth.getUTCMonth(), 1),
    ).toISOString()
  }
}
