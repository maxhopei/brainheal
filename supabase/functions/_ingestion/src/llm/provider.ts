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

/**
 * Parent context for "Read next" items.
 * Passed to LLM so it can tailor the summary to what the user was already reading.
 */
export type ParentContext = {
  postTitle: string;
  cardTexts: string[];
  selectedValue: string;
};

export type LLMProvider = {
  summarize(content: string, parentContext?: ParentContext): Promise<LLMSummarizeResult>;
  researchTopic(topic: string, parentContext?: ParentContext): Promise<string>;
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
