/**
 * Bedrock on-demand per-token pricing (USD per token).
 * Keyed by modelId. Used for cost tracking.
 * Source: https://aws.amazon.com/bedrock/pricing/ (as of 2025)
 * Prices are per 1,000 tokens — divided here to get per-token rates.
 */
export const BEDROCK_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic Claude 3.5 Haiku — cross-region inference profile (us.*)
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': {
    input: 0.0008 / 1_000,
    output: 0.004 / 1_000,
  },
  // Anthropic Claude 3.5 Haiku — bare model ID (legacy, kept for compatibility)
  'anthropic.claude-3-5-haiku-20241022-v1:0': {
    input: 0.0008 / 1_000,
    output: 0.004 / 1_000,
  },
  // Anthropic Claude 3.5 Sonnet — cross-region inference profile
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': {
    input: 0.003 / 1_000,
    output: 0.015 / 1_000,
  },
  // Anthropic Claude 3.5 Sonnet — bare model ID (legacy)
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    input: 0.003 / 1_000,
    output: 0.015 / 1_000,
  },
  // Anthropic Claude 3 Haiku
  'anthropic.claude-3-haiku-20240307-v1:0': {
    input: 0.00025 / 1_000,
    output: 0.00125 / 1_000,
  },
  // Anthropic Claude 3 Sonnet
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    input: 0.003 / 1_000,
    output: 0.015 / 1_000,
  },
  // Amazon Nova Micro
  'amazon.nova-micro-v1:0': {
    input: 0.000035 / 1_000,
    output: 0.00014 / 1_000,
  },
  // Amazon Nova Lite
  'amazon.nova-lite-v1:0': {
    input: 0.00006 / 1_000,
    output: 0.00024 / 1_000,
  },
  // Amazon Nova Pro
  'amazon.nova-pro-v1:0': {
    input: 0.0008 / 1_000,
    output: 0.0032 / 1_000,
  },
};
