import type { Card, Post } from './content.ts';

export type ReactionType = 'like' | 'meh';

/**
 * Reaction (matches reactions table)
 */
export type Reaction = {
  id: string;
  user_id: string;
  post_id: string;
  type: ReactionType;
  created_at: string;
};

/**
 * Favorite group (matches favorite_groups table)
 */
export type FavoriteGroup = {
  id: string;
  user_id: string;
  name: string;
  position: number;
  is_default: boolean;
  created_at: string;
  favorites?: Favorite[];
};

/**
 * Favorite (matches favorites table)
 */
export type Favorite = {
  id: string;
  user_id: string;
  post_id: string;
  group_id: string;
  created_at: string;
  post?: Post & { cards: Card[] };
};
