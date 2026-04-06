/**
 * supabase/functions/ingest/src/processor.ts — Content processing logic for immediate mode.
 *
 * Adapted from worker/src/processor.ts.
 * Handles the full processing pipeline: fetch, LLM, and database writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LLMCardItem, LLMCardOutput } from '@brainheal/shared';
import type { LLMProvider } from '@brainheal/ingestion';
import { fetchArticle } from '@brainheal/ingestion';

// todo: many overlapping things with worker/src/processor.ts
//  Abstract out with "Queue".

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemContext = {
  queueItemId: string;
  userId: string;
  inputType: 'url' | 'text';
  inputValue: string;
};

type CardRow = {
  post_id: string;
  position: number;
  content_type: string;
  text_content: string | null;
  media_url: string | null;
  media_caption: string | null;
};

// ---------------------------------------------------------------------------
// Main processing function
// ---------------------------------------------------------------------------

/**
 * Processes a single queue item: fetch content, call LLM, create post + cards.
 * Throws on any error — caller is responsible for error handling and status updates.
 */
export async function processItem(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  llm: LLMProvider,
  ctx: ItemContext,
): Promise<void> {
  const { queueItemId, userId, inputType, inputValue } = ctx;

  // 1. Fetch or research content
  let articleContent: string;
  let articleTitle: string;
  let articleImages: string[] = [];

  if (inputType === 'url') {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Fetching article',
        queue_item_id: queueItemId,
        url: inputValue,
      }),
    );
    const fetched = await fetchArticle(inputValue);
    articleContent = fetched.text;
    articleTitle = fetched.title;
    articleImages = fetched.images;
  } else {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Researching topic',
        queue_item_id: queueItemId,
        topic: inputValue,
      }),
    );
    articleContent = await llm.researchTopic(inputValue);
    articleTitle = inputValue;
  }

  // 2. Generate cards via LLM
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Calling LLM to generate cards',
      queue_item_id: queueItemId,
    }),
  );
  const llmResult = await llm.summarize(articleContent);
  const { output, usage } = llmResult;

  console.log(JSON.stringify({
    level: 'info',
    message: 'LLM summarization complete',
    queue_item_id: queueItemId,
    cards_count: output.cards.length,
    tokens_input: usage.tokens_input,
    tokens_output: usage.tokens_output,
    cost_usd: usage.cost_usd,
  }));

  // 3. Create the post
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
    .single();

  if (postError || !post) {
    throw new Error(`Failed to create post: ${postError?.message}`);
  }

  const postId: string = post.id;
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Created post',
      queue_item_id: queueItemId,
      post_id: postId,
    }),
  );

  // 4. Insert cards
  const cardRows = buildCardRows(
    output,
    postId,
    articleImages,
    inputType === 'url' ? inputValue : null,
  );

  if (cardRows.length === 0) {
    await supabase
      .from('posts')
      .update({ status: 'failed', error_message: 'LLM returned no valid cards' })
      .eq('id', postId);
    throw new Error('LLM returned no valid cards for this content');
  }

  const { error: cardsError } = await supabase
    .from('cards')
    .insert(cardRows);

  if (cardsError) {
    throw new Error(`Failed to insert cards: ${cardsError.message}`);
  }

  // Mark post as ready
  const { error: postUpdateError } = await supabase
    .from('posts')
    .update({ status: 'ready' })
    .eq('id', postId);

  if (postUpdateError) {
    throw new Error(`Failed to mark post as ready: ${postUpdateError.message}`);
  }

  // 5. Update feed_item.post_id (triggers Realtime notification)
  const { error: feedError } = await supabase
    .from('feed_items')
    .update({ post_id: postId })
    .eq('queue_item_id', queueItemId)
    .eq('user_id', userId);

  if (feedError) {
    throw new Error(`Failed to update feed_item: ${feedError.message}`);
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
    });

  if (costError) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Failed to record cost',
        queue_item_id: queueItemId,
        error: costError.message,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Card row builder
// ---------------------------------------------------------------------------

function buildCardRows(
  output: LLMCardOutput,
  postId: string,
  images: string[],
  sourceUrl: string | null,
): CardRow[] {
  const rows: CardRow[] = [];
  let position = 1;

  for (const card of output.cards) {
    const row = buildCardRow(card, postId, position, sourceUrl);
    if (row) {
      rows.push(row);
      position++;
    }
  }

  // Append images from the article as image cards
  for (const imageUrl of images) {
    if (position > 7) break;
    rows.push({
      post_id: postId,
      position,
      content_type: 'image',
      text_content: null,
      media_url: imageUrl,
      media_caption: null,
    });
    position++;
  }

  return rows;
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
    };
  }

  if (card.type === 'key_points') {
    const text = card.items.map((item) => `- ${item}`).join('\n');
    return {
      post_id: postId,
      position,
      content_type: 'key_points',
      text_content: text,
      media_url: null,
      media_caption: null,
    };
  }

  if (card.type === 'quote') {
    const text = card.attribution
      ? `> ${card.content}\n\n— ${card.attribution}`
      : `> ${card.content}`;
    return {
      post_id: postId,
      position,
      content_type: 'quote',
      text_content: text,
      media_url: null,
      media_caption: null,
    };
  }

  if (card.type === 'image') {
    return {
      post_id: postId,
      position,
      content_type: 'image',
      text_content: null,
      media_url: card.url,
      media_caption: card.caption ?? null,
    };
  }

  return null;
}
