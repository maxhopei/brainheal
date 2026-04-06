import type { SupabaseClient } from '@supabase/supabase-js'
import { Logger } from '@brainheal/logging'

export type AddItemResult = {
  queueItemId: string
  feedItemId: string
}

export class IngestionQueue {
  private readonly logger = Logger.create('BillingRepository')

  constructor(private readonly supabase: SupabaseClient) {
  }

  public async addItem(
    userId: string,
    inputType: string,
    inputValue: string,
    initialStatus: 'processing' | 'pending',
  ): Promise<AddItemResult> {
    // Insert queue_item
    const { data: queueItem, error: queueError } = await this.supabase
      .from('queue_items')
      .insert({
        user_id: userId,
        input_type: inputType,
        input_value: inputValue,
        status: initialStatus,
        retry_count: 0,
        started_at: initialStatus === 'processing' ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (queueError) throw new Error('Failed to create queue item', { cause: queueError })
    if (!queueItem) throw new Error('Failed to create queue item: no item id returned')

    // Compute next feed position: MAX(position) + 1 for this user
    const { data: posData, error: posError } = await this.supabase
      .from('feed_items')
      .select('position')
      .eq('user_id', userId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (posError) throw new Error('Failed to compute feed position', { cause: posError })

    const nextPosition = posData ? (posData.position as number) + 1 : 1

    // Insert feed_item with post_id=null (skeleton state)
    const { data: feedItem, error: feedError } = await this.supabase
      .from('feed_items')
      .insert({
        user_id: userId,
        post_id: null,
        queue_item_id: queueItem.id,
        position: nextPosition,
        state: 'unread',
        source_type: 'self',
      })
      .select('id')
      .single()

    if (feedError || !feedItem) {
      await this.supabase.from('queue_items').delete().eq('id', queueItem.id)
      if (feedError) throw new Error('Failed to create feed item', { cause: feedError })
      if (!feedItem) throw new Error('Failed to create feed item: no feed item ID provided')
    }

    return {
      queueItemId: queueItem.id,
      feedItemId: feedItem.id,
    }
  }

  public async markItemCompleted(queueItemId: string): Promise<void> {
    await this.supabase
      .from('queue_items')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', queueItemId)
  }

  public async markItemFailed(
    queueItemId: string,
    errorMessage: string,
  ): Promise<void> {
    // Mark queue item as failed
    await this.supabase
      .from('queue_items')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', queueItemId)

    // Update any associated post to failed status
    const { data: feedItem } = await this.supabase
      .from('feed_items')
      .select('post_id')
      .eq('queue_item_id', queueItemId)
      .maybeSingle()

    if (feedItem?.post_id) {
      await this.supabase
        .from('posts')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', feedItem.post_id)
    }
  }
}
