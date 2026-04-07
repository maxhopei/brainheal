import type { SupabaseClient } from '@supabase/supabase-js'

export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type InputType = 'url' | 'text'

/**
 * Queue item (matches queue_items table)
 */
export type QueueItem = {
  id: string
  user_id: string
  input_type: InputType
  input_value: string
  status: QueueItemStatus
  error_message: string | null
  retry_count: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export type AddItemResult = {
  queueItemId: string
  feedItemId: string
}

export type ClaimedItem = {
  id: string
  userId: string
  inputType: InputType
  inputValue: string
  retryCount: number
}

export class IngestionQueue {
  constructor(private readonly supabase: SupabaseClient) {
  }

  public async addItem(
    userId: string,
    inputType: string,
    inputValue: string,
    initialStatus: 'pending' | 'processing',
  ): Promise<AddItemResult> {
    // Insert queue_item
    const { data: queueItem, error: queueError } = await this.supabase
      .from('queue_items')
      .insert({
        user_id: userId,
        input_type: inputType,
        input_value: inputValue,
        status: initialStatus satisfies QueueItemStatus,
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

  public async claimNextPendingItem(): Promise<ClaimedItem | null> {
    // 1. Claim the next pending item using a Postgres RPC to ensure atomicity
    const { data: claimedRows, error: claimError } = await this.supabase
      .rpc('claim_next_queue_item')

    if (claimError) {
      throw new Error('Failed to claim next queue item', { cause: claimError })
    }

    // SETOF returns an array; empty array means queue is empty.
    // Normalise: PostgREST may return a plain object for single-row composite return types.
    const claimedItem = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows

    if (!claimedItem || !claimedItem.id) {
      return null
    }

    return {
      id: claimedItem.id,
      userId: claimedItem.user_id,
      inputType: claimedItem.input_type,
      inputValue: claimedItem.input_value,
      retryCount: claimedItem.retry_count ?? 0,
    }
  }

  public async markItemCompleted(queueItemId: string): Promise<void> {
    await this.supabase
      .from('queue_items')
      .update({ status: 'completed' satisfies QueueItemStatus, completed_at: new Date().toISOString() })
      .eq('id', queueItemId)
  }

  public async markItemPending(queueItemId: string): Promise<void> {
    await this.supabase
      .from('queue_items')
      .update({ status: 'pending' satisfies QueueItemStatus, started_at: null })
      .eq('id', queueItemId)
  }

  public async requeueItem(queueItemId: string, newRetryCount: number, errorMessage: string): Promise<void> {
    await this.supabase
      .from('queue_items')
      .update({
        status: 'pending' satisfies QueueItemStatus,
        retry_count: newRetryCount,
        started_at: null,
        error_message: errorMessage,
      })
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
        status: 'failed' satisfies QueueItemStatus,
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
        .update({ status: 'failed' satisfies QueueItemStatus, error_message: errorMessage })
        .eq('id', feedItem.post_id)
    }
  }
}
