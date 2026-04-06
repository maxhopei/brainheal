import type { QueueItem } from './queue.ts';

export type CardType = 'text' | 'image' | 'key_points' | 'quote';

export type PostStatus = 'processing' | 'ready' | 'failed';

export type FeedItemState = 'unread' | 'read';

export type SourceType = 'self' | 'shared' | 'suggested';

/**
 * Feed item (matches feed_items table, with optional nested data)
 */
export type FeedItem = {
  id: string;
  user_id: string;
  post_id: string | null;
  queue_item_id: string;
  position: number;
  state: FeedItemState;
  source_type: SourceType;
  shared_by_user_id: string | null;
  shared_message: string | null;
  created_at: string;
  read_at: string | null;
  post?: Post & { cards: Card[] };
  queue_item?: QueueItem;
};

/**
 * Post (matches posts table)
 */
export type Post = {
  id: string;
  user_id: string;
  source_url: string | null;
  source_text: string | null;
  title: string;
  status: PostStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Card (matches cards table)
 */
export type Card = {
  id: string;
  post_id: string;
  position: number;
  content_type: CardType;
  text_content: string | null;
  media_url: string | null;
  media_caption: string | null;
  created_at: string;
};
