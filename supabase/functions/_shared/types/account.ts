export type BillingTier = 'free' | 'paid';

/**
 * Profile (matches profiles table)
 */
export type Profile = {
  id: string;
  nickname: string | null;
  billing_tier: BillingTier;
  created_at: string;
  updated_at: string;
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