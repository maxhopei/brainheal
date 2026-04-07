/**
 * LLM output shape returned from LLM JSON
 */
export type LLMCardOutput = {
  title: string;
  cards: LLMCardItem[];
};

export type LLMCardItem =
  | { type: 'text'; content: string }
  | { type: 'key_points'; items: string[] }
  | { type: 'quote'; content: string; attribution?: string }
  | { type: 'image'; url: string; caption?: string };

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
