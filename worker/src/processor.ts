/**
 * worker/src/processor.ts — Core processing logic.
 *
 * Claims pending queue items and processes them:
 * 1. Fetch/extract article content (URL) or research topic (text)
 * 2. Call LLM to generate structured cards
 * 3. Write post + cards to the database
 * 4. Update feed_item.post_id (triggers Realtime push to client)
 * 5. Record LLM costs
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LLMCardItem, LLMCardOutput } from '@brainheal/shared'
import type { Accountant, LLMProvider } from '@brainheal/ingestion'
import { fetchArticle } from '@brainheal/ingestion'

const MAX_RETRIES = 2

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'warn' | 'error'

type LogPayload = {
  level: LogLevel
  message: string
  queue_item_id?: string
  user_id?: string
  post_id?: string
  error?: string
  [key: string]: unknown
}

function log(payload: LogPayload): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...payload }))
}

// ---------------------------------------------------------------------------
// Main processor
// ---------------------------------------------------------------------------

/**
 * Claims and processes the next pending queue item.
 * Uses FOR UPDATE SKIP LOCKED to prevent concurrent workers claiming the same item.
 *
 * Returns true if an item was processed, false if queue was empty.
 */
export async function processNextItem(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  llm: LLMProvider,
  accountant: Accountant,
): Promise<boolean> {
  // 1. Claim the next pending item using a Postgres RPC to ensure atomicity
  const { data: claimedRows, error: claimError } = await supabase
    .rpc('claim_next_queue_item')

  if (claimError) {
    log({ level: 'error', message: 'Failed to claim queue item', error: claimError.message })
    return false
  }

  // SETOF returns an array; empty array means queue is empty.
  // Normalise: PostgREST may return a plain object for single-row composite return types.
  const claimedItem = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows

  if (!claimedItem || !claimedItem.id) {
    return false
  }
  const queueItemId: string = claimedItem.id
  const userId: string = claimedItem.user_id
  const inputType: 'url' | 'text' = claimedItem.input_type
  const inputValue: string = claimedItem.input_value
  const retryCount: number = claimedItem.retry_count ?? 0

  log({
    level: 'info',
    message: 'Processing queue item',
    queue_item_id: queueItemId,
    user_id: userId,
    input_type: inputType,
  })

  // 2. Check daily budget
  let budgetCheck
  try {
    budgetCheck = await accountant.checkDailyBudget(supabase, userId)
  } catch (err) {
    log({
      level: 'error',
      message: 'Budget check failed',
      queue_item_id: queueItemId,
      error: String(err),
    })
    // Revert to pending so it can be retried
    await supabase
      .from('queue_items')
      .update({ status: 'pending', started_at: null })
      .eq('id', queueItemId)
    return false
  }

  if (!budgetCheck.allowed) {
    log({
      level: 'info',
      message: 'Daily budget exceeded — deferring item',
      queue_item_id: queueItemId,
      user_id: userId,
      daily_limit: budgetCheck.dailyLimit,
      today_spend: budgetCheck.todaySpend,
    })
    // Revert to pending so it will be picked up tomorrow
    await supabase
      .from('queue_items')
      .update({ status: 'pending', started_at: null })
      .eq('id', queueItemId)
    return false
  }

  // 3. Process the item
  try {
    await processItem(supabase, llm, {
      queueItemId,
      userId,
      inputType,
      inputValue,
    })

    // 4. Mark completed
    await supabase
      .from('queue_items')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', queueItemId)

    log({ level: 'info', message: 'Queue item completed', queue_item_id: queueItemId })
    return true
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log({
      level: 'error',
      message: 'Processing failed',
      queue_item_id: queueItemId,
      error: errorMessage,
    })

    const newRetryCount = retryCount + 1

    if (newRetryCount < MAX_RETRIES) {
      // Re-queue for retry
      await supabase
        .from('queue_items')
        .update({
          status: 'pending',
          retry_count: newRetryCount,
          started_at: null,
          error_message: errorMessage,
        })
        .eq('id', queueItemId)
      log({
        level: 'warn',
        message: `Retrying item (attempt ${newRetryCount + 1}/${MAX_RETRIES})`,
        queue_item_id: queueItemId,
      })
    } else {
      // Mark as failed
      await supabase
        .from('queue_items')
        .update({
          status: 'failed',
          retry_count: newRetryCount,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', queueItemId)

      // Update the associated feed_item's post to failed status (if a post was partially created)
      // Also update any existing post to failed
      const { data: feedItem } = await supabase
        .from('feed_items')
        .select('post_id')
        .eq('queue_item_id', queueItemId)
        .maybeSingle()

      if (feedItem?.post_id) {
        await supabase
          .from('posts')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('id', feedItem.post_id)
      }

      log({
        level: 'error',
        message: 'Item permanently failed after max retries',
        queue_item_id: queueItemId,
      })
    }

    return false
  }
}

// ---------------------------------------------------------------------------
// Item processing pipeline
// ---------------------------------------------------------------------------

type ItemContext = {
  queueItemId: string
  userId: string
  inputType: 'url' | 'text'
  inputValue: string
}

async function processItem(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  llm: LLMProvider,
  ctx: ItemContext,
): Promise<void> {
  const { queueItemId, userId, inputType, inputValue } = ctx

  // 1. Fetch or research content
  let articleContent: string
  let articleTitle: string
  let articleImages: string[] = []

  if (inputType === 'url') {
    log({
      level: 'info',
      message: 'Fetching article',
      queue_item_id: queueItemId,
      url: inputValue,
    })
    const fetched = await fetchArticle(inputValue)
    articleContent = fetched.text
    articleTitle = fetched.title
    articleImages = fetched.images
  } else {
    // Free text: use LLM to research the topic first
    log({
      level: 'info',
      message: 'Researching topic',
      queue_item_id: queueItemId,
      topic: inputValue,
    })
    articleContent = await llm.researchTopic(inputValue)
    articleTitle = inputValue
  }

  // 2. Generate cards via LLM
  log({ level: 'info', message: 'Calling LLM to generate cards', queue_item_id: queueItemId })
  const llmResult = await llm.summarize(articleContent)
  const { output, usage } = llmResult

  log({
    level: 'info',
    message: 'LLM summarization complete',
    queue_item_id: queueItemId,
    cards_count: output.cards.length,
    tokens_input: usage.tokens_input,
    tokens_output: usage.tokens_output,
    cost_usd: usage.cost_usd,
  })

  // 3. Create the post (with status='processing' until cards are persisted)
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      source_url: inputType === 'url' ? inputValue : null,
      source_text: inputType === 'text' ? inputValue : null,
      title: output.title || articleTitle || 'Untitled',
      status: 'processing',
    })
    .select('id')
    .single()

  if (postError || !post) {
    throw new Error(`Failed to create post: ${postError?.message}`)
  }

  const postId: string = post.id
  log({ level: 'info', message: 'Created post', queue_item_id: queueItemId, post_id: postId })

  // 4. Insert cards
  const cardRows = buildCardRows(
    output,
    postId,
    articleImages,
    inputType === 'url' ? inputValue : null,
  )

  if (cardRows.length === 0) {
    // No valid cards generated — mark post as failed
    await supabase
      .from('posts')
      .update({ status: 'failed', error_message: 'LLM returned no valid cards' })
      .eq('id', postId)
    throw new Error('LLM returned no valid cards for this content')
  }

  const { error: cardsError } = await supabase
    .from('cards')
    .insert(cardRows)

  if (cardsError) {
    throw new Error(`Failed to insert cards: ${cardsError.message}`)
  }

  // Mark post as ready now that cards are persisted
  const { error: postUpdateError } = await supabase
    .from('posts')
    .update({ status: 'ready' })
    .eq('id', postId)

  if (postUpdateError) {
    throw new Error(`Failed to mark post as ready: ${postUpdateError.message}`)
  }

  // 5. Update feed_item.post_id (this triggers Realtime notification to the client)
  const { error: feedError } = await supabase
    .from('feed_items')
    .update({ post_id: postId })
    .eq('queue_item_id', queueItemId)
    .eq('user_id', userId)

  if (feedError) {
    throw new Error(`Failed to update feed_item: ${feedError.message}`)
  }

  // 6. Record LLM costs
  const { error: costError } = await supabase
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
    // Non-fatal: log but don't fail the job
    log({
      level: 'warn',
      message: 'Failed to record cost',
      queue_item_id: queueItemId,
      error: costError.message,
    })
  }
}

// ---------------------------------------------------------------------------
// Card row builder
// ---------------------------------------------------------------------------

type CardRow = {
  post_id: string
  position: number
  content_type: string
  text_content: string | null
  media_url: string | null
  media_caption: string | null
}

function buildCardRows(
  output: LLMCardOutput,
  postId: string,
  images: string[],
  sourceUrl: string | null,
): CardRow[] {
  const rows: CardRow[] = []
  let position = 1

  for (const card of output.cards) {
    const row = buildCardRow(card, postId, position, sourceUrl)
    if (row) {
      rows.push(row)
      position++
    }
  }

  // Append images from the article as image cards (after the text cards)
  for (const imageUrl of images) {
    if (position > 7) break // Enforce 7-card soft limit
    rows.push({
      post_id: postId,
      position,
      content_type: 'image',
      text_content: null,
      media_url: imageUrl,
      media_caption: null,
    })
    position++
  }

  return rows
}

function buildCardRow(
  card: LLMCardItem,
  postId: string,
  position: number,
  _sourceUrl: string | null,
): CardRow | null {
  if (card.type === 'text') {
    return {
      post_id: postId,
      position,
      content_type: 'text',
      text_content: card.content,
      media_url: null,
      media_caption: null,
    }
  }

  if (card.type === 'key_points') {
    // Serialize key_points as Markdown bullet list in text_content
    const text = card.items.map((item) => `- ${item}`).join('\n')
    return {
      post_id: postId,
      position,
      content_type: 'key_points',
      text_content: text,
      media_url: null,
      media_caption: null,
    }
  }

  if (card.type === 'quote') {
    const text = card.attribution ? `> ${card.content}\n\n— ${card.attribution}` : `> ${card.content}`
    return {
      post_id: postId,
      position,
      content_type: 'quote',
      text_content: text,
      media_url: null,
      media_caption: null,
    }
  }

  if (card.type === 'image') {
    return {
      post_id: postId,
      position,
      content_type: 'image',
      text_content: null,
      media_url: card.url,
      media_caption: card.caption ?? null,
    }
  }

  return null
}
