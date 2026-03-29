// Card types
export type CardType = 'text' | 'image' | 'key_points' | 'quote';

// Post status
export type PostStatus = 'processing' | 'ready' | 'failed';

// Queue item status
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Feed item state
export type FeedItemState = 'unread' | 'read';

// Billing tier
export type BillingTier = 'free' | 'paid';

// Source type for feed items
export type SourceType = 'self' | 'shared' | 'suggested';

// Input type for queue items
export type InputType = 'url' | 'text';

// Reaction type
export type ReactionType = 'like' | 'meh';

// Profile (matches profiles table)
export type Profile = {
  id: string;
  nickname: string | null;
  billing_tier: BillingTier;
  created_at: string;
  updated_at: string;
};

// Post (matches posts table)
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

// Card (matches cards table)
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

// Queue item (matches queue_items table)
export type QueueItem = {
  id: string;
  user_id: string;
  input_type: InputType;
  input_value: string;
  status: QueueStatus;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

// Feed item (matches feed_items table, with optional nested data)
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

// Cost record (matches cost_records table)
export type CostRecord = {
  id: string;
  user_id: string;
  queue_item_id: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model_used: string;
  created_at: string;
};

// Favorite group (matches favorite_groups table)
export type FavoriteGroup = {
  id: string;
  user_id: string;
  name: string;
  position: number;
  is_default: boolean;
  created_at: string;
  favorites?: Favorite[];
};

// Favorite (matches favorites table)
export type Favorite = {
  id: string;
  user_id: string;
  post_id: string;
  group_id: string;
  created_at: string;
  post?: Post & { cards: Card[] };
};

// Reaction (matches reactions table)
export type Reaction = {
  id: string;
  user_id: string;
  post_id: string;
  type: ReactionType;
  created_at: string;
};

// LLM output for a single card
export type LLMCardItem =
  | { type: 'text'; content: string }
  | { type: 'key_points'; items: string[] }
  | { type: 'quote'; content: string; attribution?: string }
  | { type: 'image'; url: string; caption?: string };

// LLM output shape returned from LLM JSON
export type LLMCardOutput = {
  title: string;
  cards: LLMCardItem[];
};

// Ingest request body
export type IngestRequest = {
  type: InputType;
  value: string;
};

// Ingest response body
export type IngestResponse = {
  queue_item_id: string;
  feed_item_id: string;
};

// Error response body (used across all Edge Functions)
export type ErrorResponse = {
  error: string;
};
