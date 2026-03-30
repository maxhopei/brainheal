import { assertEquals } from '@std/assert';
import type {
  BillingTier,
  Card,
  CardType,
  CostRecord,
  ErrorResponse,
  Favorite,
  FavoriteGroup,
  FeedItem,
  FeedItemState,
  IngestRequest,
  IngestResponse,
  InputType,
  LLMCardItem,
  LLMCardOutput,
  Post,
  PostStatus,
  Profile,
  QueueItem,
  QueueStatus,
  Reaction,
  ReactionType,
  SourceType,
} from './types.ts';

Deno.test('CardType union includes all expected values', () => {
  const validTypes: CardType[] = ['text', 'image', 'key_points', 'quote'];
  assertEquals(validTypes.length, 4);
});

Deno.test('PostStatus union includes all expected values', () => {
  const validStatuses: PostStatus[] = ['processing', 'ready', 'failed'];
  assertEquals(validStatuses.length, 3);
});

Deno.test('QueueStatus union includes all expected values', () => {
  const validStatuses: QueueStatus[] = ['pending', 'processing', 'completed', 'failed'];
  assertEquals(validStatuses.length, 4);
});

Deno.test('FeedItemState union includes all expected values', () => {
  const validStates: FeedItemState[] = ['unread', 'read'];
  assertEquals(validStates.length, 2);
});

Deno.test('BillingTier union includes all expected values', () => {
  const validTiers: BillingTier[] = ['free', 'paid'];
  assertEquals(validTiers.length, 2);
});

Deno.test('SourceType union includes all expected values', () => {
  const validTypes: SourceType[] = ['self', 'shared', 'suggested'];
  assertEquals(validTypes.length, 3);
});

Deno.test('InputType union includes all expected values', () => {
  const validTypes: InputType[] = ['url', 'text'];
  assertEquals(validTypes.length, 2);
});

Deno.test('ReactionType union includes all expected values', () => {
  const validTypes: ReactionType[] = ['like', 'meh'];
  assertEquals(validTypes.length, 2);
});

Deno.test('Profile type shape is correct', () => {
  const profile: Profile = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    nickname: 'testuser',
    billing_tier: 'free',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
  assertEquals(profile.billing_tier, 'free');
  assertEquals(profile.nickname, 'testuser');
});

Deno.test('Post type shape is correct', () => {
  const post: Post = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    source_url: 'https://example.com/article',
    source_text: null,
    title: 'Test Article',
    status: 'ready',
    error_message: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
  assertEquals(post.status, 'ready');
  assertEquals(post.source_text, null);
});

Deno.test('Card type shape is correct', () => {
  const card: Card = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    post_id: '123e4567-e89b-12d3-a456-426614174001',
    position: 1,
    content_type: 'text',
    text_content: 'This is the main idea of the article.',
    media_url: null,
    media_caption: null,
    created_at: '2024-01-01T00:00:00Z',
  };
  assertEquals(card.content_type, 'text');
  assertEquals(card.position, 1);
});

Deno.test('QueueItem type shape is correct', () => {
  const item: QueueItem = {
    id: '123e4567-e89b-12d3-a456-426614174003',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    input_type: 'url',
    input_value: 'https://example.com/article',
    status: 'pending',
    error_message: null,
    retry_count: 0,
    created_at: '2024-01-01T00:00:00Z',
    started_at: null,
    completed_at: null,
  };
  assertEquals(item.status, 'pending');
  assertEquals(item.retry_count, 0);
});

Deno.test('FeedItem type shape is correct', () => {
  const item: FeedItem = {
    id: '123e4567-e89b-12d3-a456-426614174004',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    post_id: null,
    queue_item_id: '123e4567-e89b-12d3-a456-426614174003',
    position: 1,
    state: 'unread',
    source_type: 'self',
    shared_by_user_id: null,
    shared_message: null,
    created_at: '2024-01-01T00:00:00Z',
    read_at: null,
  };
  assertEquals(item.state, 'unread');
  assertEquals(item.post_id, null);
  assertEquals(item.source_type, 'self');
});

Deno.test('LLMCardOutput type shape is correct', () => {
  const output: LLMCardOutput = {
    title: 'Test Article Summary',
    cards: [
      { type: 'text', content: 'Main idea of the article.' },
      { type: 'key_points', items: ['Point 1', 'Point 2', 'Point 3'] },
      { type: 'quote', content: 'A notable quote.', attribution: 'Author Name' },
    ],
  };
  assertEquals(output.cards.length, 3);
  assertEquals(output.title, 'Test Article Summary');
});

Deno.test('IngestRequest type shape is correct', () => {
  const req: IngestRequest = {
    type: 'url',
    value: 'https://example.com/article',
  };
  assertEquals(req.type, 'url');
});

Deno.test('IngestResponse type shape is correct', () => {
  const res: IngestResponse = {
    queue_item_id: '123e4567-e89b-12d3-a456-426614174003',
    feed_item_id: '123e4567-e89b-12d3-a456-426614174004',
  };
  assertEquals(typeof res.queue_item_id, 'string');
  assertEquals(typeof res.feed_item_id, 'string');
});

Deno.test('ErrorResponse type shape is correct', () => {
  const err: ErrorResponse = { error: 'Something went wrong' };
  assertEquals(err.error, 'Something went wrong');
});

Deno.test('CostRecord type shape is correct', () => {
  const record: CostRecord = {
    id: '123e4567-e89b-12d3-a456-426614174005',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    queue_item_id: '123e4567-e89b-12d3-a456-426614174003',
    tokens_input: 1500,
    tokens_output: 500,
    cost_usd: 0.025,
    model_used: 'gpt-4o-mini',
    created_at: '2024-01-01T00:00:00Z',
  };
  assertEquals(record.tokens_input, 1500);
  assertEquals(record.cost_usd, 0.025);
});

Deno.test('FavoriteGroup type shape is correct', () => {
  const group: FavoriteGroup = {
    id: '123e4567-e89b-12d3-a456-426614174006',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Saved',
    position: 1,
    is_default: true,
    created_at: '2024-01-01T00:00:00Z',
  };
  assertEquals(group.is_default, true);
  assertEquals(group.name, 'Saved');
});

Deno.test('Favorite type shape is correct', () => {
  const fav: Favorite = {
    id: '123e4567-e89b-12d3-a456-426614174007',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    post_id: '123e4567-e89b-12d3-a456-426614174001',
    group_id: '123e4567-e89b-12d3-a456-426614174006',
    created_at: '2024-01-01T00:00:00Z',
  };
  assertEquals(typeof fav.post_id, 'string');
});

Deno.test('Reaction type shape is correct', () => {
  const reaction: Reaction = {
    id: '123e4567-e89b-12d3-a456-426614174008',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    post_id: '123e4567-e89b-12d3-a456-426614174001',
    type: 'like',
    created_at: '2024-01-01T00:00:00Z',
  };
  assertEquals(reaction.type, 'like');
});

Deno.test('LLMCardItem discriminated union - text type', () => {
  const card: LLMCardItem = { type: 'text', content: 'Some text content' };
  if (card.type === 'text') {
    assertEquals(card.content, 'Some text content');
  }
});

Deno.test('LLMCardItem discriminated union - key_points type', () => {
  const card: LLMCardItem = { type: 'key_points', items: ['point1', 'point2'] };
  if (card.type === 'key_points') {
    assertEquals(card.items.length, 2);
  }
});

Deno.test('LLMCardItem discriminated union - quote type', () => {
  const card: LLMCardItem = {
    type: 'quote',
    content: 'A famous quote',
    attribution: 'Famous Person',
  };
  if (card.type === 'quote') {
    assertEquals(card.content, 'A famous quote');
    assertEquals(card.attribution, 'Famous Person');
  }
});
