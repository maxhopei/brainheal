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
  parent_post_id: string | null
  parent_card_id: string | null
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
  parentPostId: string | null
  parentCardId: string | null
}

export type AddItemOptions = {
  parentPostId?: string | null
  parentCardId?: string | null
}

export class IngestionQueue {
  constructor(private readonly supabase: SupabaseClient) {
  }

  public async addItem(
    userId: string,
    inputType: string,
    inputValue: string,
    initialStatus: 'pending' | 'processing',
    options: AddItemOptions = {},
  ): Promise<AddItemResult> {
    const { parentPostId = null, parentCardId = null } = options

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
        parent_post_id: parentPostId,
        parent_card_id: parentCardId,
      })
      .select('id')
      .single()

    if (queueError) throw new Error('Failed to create queue item', { cause: queueError })
    if (!queueItem) throw new Error('Failed to create queue item: no item id returned')

    // Compute feed position
    let nextPosition: number

    if (parentPostId) {
      // Find parent's current feed position for this user
      const { data: parentFeedItem, error: parentPosError } = await this.supabase
        .from('feed_items')
        .select('position')
        .eq('post_id', parentPostId)
        .eq('user_id', userId)
        .maybeSingle()

      if (parentPosError) throw new Error('Failed to find parent feed position', { cause: parentPosError })

      if (parentFeedItem) {
        const parentPos = parentFeedItem.position as number

        // Find the item immediately after the parent so we can place the new
        // item exactly halfway between them — safe for repeated / chained reads.
        const { data: nextItem, error: nextPosError } = await this.supabase
          .from('feed_items')
          .select('position')
          .eq('user_id', userId)
          .gt('position', parentPos)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (nextPosError) throw new Error('Failed to find next feed position', { cause: nextPosError })

        nextPosition = nextItem
          ? (parentPos + (nextItem.position as number)) / 2
          : parentPos + 1
      } else {
        // Parent not found (may have been read/deleted) — fall back to end of feed
        nextPosition = await this.getMaxPosition(userId)
      }
    } else {
      nextPosition = await this.getMaxPosition(userId)
    }

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
        parent_post_id: parentPostId,
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

  private async getMaxPosition(userId: string): Promise<number> {
    const { data: posData, error: posError } = await this.supabase
      .from('feed_items')
      .select('position')
      .eq('user_id', userId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (posError) throw new Error('Failed to compute feed position', { cause: posError })

    return posData ? (posData.position as number) + 1 : 1
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
      parentPostId: claimedItem.parent_post_id ?? null,
      parentCardId: claimedItem.parent_card_id ?? null,
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
