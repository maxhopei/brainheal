import type { SupabaseClient } from '@supabase/supabase-js'

export type BillingTier = 'free' | 'paid'

/**
 * Profile (matches profiles table)
 */
export type Profile = {
  id: string
  nickname: string | null
  billing_tier: BillingTier
  created_at: string
  updated_at: string
}

export class ProfileRepository {
  constructor(private readonly supabase: SupabaseClient) {
  }

  public async getBillingTier(userId: string): Promise<BillingTier> {
    // 1. Get billing tier
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('billing_tier')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      throw new Error(
        `Failed to fetch profile for user ${userId}: ${profileError?.message}`,
      )
    }

    return (profile.billing_tier as BillingTier) ?? 'free'
  }
}
