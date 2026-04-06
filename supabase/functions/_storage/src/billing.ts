import type { SupabaseClient } from '@supabase/supabase-js'
import { Logger } from '@brainheal/logging'
import type { LLMUsage } from '@brainheal/ingestion'

export class BillingRepository {
  private readonly logger = Logger.create('BillingRepository')

  constructor(private readonly supabase: SupabaseClient) {
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
}
