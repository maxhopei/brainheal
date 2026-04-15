import type { SupabaseClient } from '@supabase/supabase-js'
import { Logger } from '@brainheal/logging'

import type { QueueItem } from './queue.ts'

export type CardType = 'text' | 'image' | 'key_points' | 'quote'

export type PostStatus = 'processing' | 'ready' | 'failed'

export type FeedItemState = 'unread' | 'read'

export type SourceType = 'self' | 'shared' | 'suggested'

/**
 * Feed item (matches feed_items table, with optional nested data)
 */
export type FeedItem = {
  id: string
  user_id: string
  post_id: string | null
  queue_item_id: string
  position: number
  state: FeedItemState
  source_type: SourceType
  shared_by_user_id: string | null
  shared_message: string | null
  created_at: string
  read_at: string | null
  post?: Post & { cards: Card[] }
  queue_item?: QueueItem
}

/**
 * Post (matches posts table)
 */
export type Post = {
  id: string
  user_id: string
  source_url: string | null
  source_text: string | null
  title: string
  status: PostStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

/**
 * Card (matches cards table)
 */
export type Card = {
  id: string
  post_id: string
  position: number
  content_type: CardType
  text_content: string | null
  media_url: string | null
  media_caption: string | null
  created_at: string
}

export type AddPostProps = {
  title: string
  source: {
    type: 'url' | 'text'
    value: string
  }
}

type CardInsertData = Pick<
  Card,
  'post_id' | 'position' | 'content_type' | 'text_content' | 'media_url' | 'media_caption'
>

export type AddPostCardProps = {
  position: number
  contentType: CardType
  textContent: string | null
  mediaUrl: string | null
  mediaCaption: string | null
}

export type ParentPostContext = {
  postTitle: string
  cardTexts: string[]
}

export class ContentRepository {
  private readonly logger = Logger.create('ContentRepository')

  constructor(private readonly supabase: SupabaseClient) {
  }

  /**
   * Fetches the title and card text content of a parent post for LLM context.
   * Returns null if the post is not found or does not belong to the user.
   */
  public async getParentPostContext(postId: string, userId: string): Promise<ParentPostContext | null> {
    const { data, error } = await this.supabase
      .from('posts')
      .select('title, cards(position, text_content)')
      .eq('id', postId)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return null
    }

    const cards = (data.cards as Array<{ position: number; text_content: string | null }> ?? [])
      .sort((a, b) => a.position - b.position)
      .map((c) => c.text_content ?? '')
      .filter((t) => t.length > 0)

    return {
      postTitle: data.title,
      cardTexts: cards,
    }
  }

  public async addPost(userId: string, queueItemId: string, post: AddPostProps, cards: AddPostCardProps[]) {
    const logger = this.logger.withProps({ queueItemId, userId })

    // 1. Create the post
    const { data: postData, error: postError } = await this.supabase
      .from('posts')
      .insert({
        user_id: userId,
        source_url: post.source.type === 'url' ? post.source.value : null,
        source_text: post.source.type === 'text' ? post.source.value : null,
        title: post.title,
        status: 'processing',
      })
      .select('id')
      .single()

    if (postError || !post) {
      throw new Error(`Failed to create post: ${postError?.message}`)
    }

    const postId: string = postData.id

    logger.addProps({ postId })

    logger.debug('Created post')

    if (cards.length === 0) {
      await this.supabase
        .from('posts')
        .update({ status: 'failed', error_message: 'LLM returned no valid cards' })
        .eq('id', postId)
      throw new Error('LLM returned no valid cards for this content')
    }

    const cardRows = cards.map<CardInsertData>((card) => ({
      post_id: postId,
      position: card.position,
      content_type: card.contentType,
      text_content: card.textContent,
      media_url: card.mediaUrl,
      media_caption: card.mediaCaption,
    }))

    const { error: cardsError } = await this.supabase
      .from('cards')
      .insert(cardRows)

    if (cardsError) {
      throw new Error(`Failed to insert cards: ${cardsError.message}`)
    }

    // Mark post as ready
    const { error: postUpdateError } = await this.supabase
      .from('posts')
      .update({ status: 'ready' })
      .eq('id', postId)

    if (postUpdateError) {
      throw new Error(`Failed to mark post as ready: ${postUpdateError.message}`)
    }

    // 5. Update feed_item.post_id (triggers Realtime notification)
    const { error: feedError } = await this.supabase
      .from('feed_items')
      .update({ post_id: postId })
      .eq('queue_item_id', queueItemId)
      .eq('user_id', userId)

    if (feedError) {
      throw new Error(`Failed to update feed_item: ${feedError.message}`)
    }
  }
}
