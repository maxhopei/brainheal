import type { SupabaseClient } from '@supabase/supabase-js'
import { Logger } from '@brainheal/logging'

export type AddPostProps = {
  title: string
  source: {
    type: 'url' | 'text'
    value: string
  }
}

type CardRow = {
  post_id: string
  position: number
  content_type: string
  text_content: string | null
  media_url: string | null
  media_caption: string | null
}

export type AddPostCardProps = {
  position: number
  contentType: string
  textContent: string | null
  mediaUrl: string | null
  mediaCaption: string | null
}

export class ContentRepository {
  private readonly logger = Logger.create('ContentRepository')

  constructor(private readonly supabase: SupabaseClient) {
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

    const cardRows = cards.map<CardRow>((card) => ({
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
