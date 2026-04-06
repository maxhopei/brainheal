import type { InputType } from './queue.ts';

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
