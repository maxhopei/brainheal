import type { LLMCardOutput } from '@brainheal/shared';

export type LLMProvider = {
  summarize(content: string): Promise<LLMSummarizeResult>;
  researchTopic(topic: string): Promise<string>;
};

export type LLMUsage = {
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model_used: string;
};

export type LLMSummarizeResult = {
  output: LLMCardOutput;
  usage: LLMUsage;
};
