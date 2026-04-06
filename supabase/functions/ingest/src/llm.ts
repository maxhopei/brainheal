/**
 * supabase/functions/ingest/src/llm.ts — LLM abstraction layer.
 *
 * Copied from worker/src/llm.ts for immediate mode processing.
 * Provides a unified interface for OpenAI, Anthropic, and AWS Bedrock providers.
 */

import { type LLMCardItem, type LLMCardOutput, signRequest } from '../../_shared/mod.ts';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

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

export type LLMProvider = {
  summarize(content: string): Promise<LLMSummarizeResult>;
  researchTopic(topic: string): Promise<string>;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a content summarizer for a personal reading app called BrainHeal.
Your job is to transform articles or research into bite-sized, insightful cards.

Rules:
- First card: the main idea / TL;DR (most important takeaway, most impactful sentence or two).
- Subsequent cards: supporting details, examples, context, related ideas.
- Each card: 80–150 words, concise, self-contained, and easy to read in 10–30 seconds.
- Produce 3–7 cards depending on article length and complexity.
- If the article is very short (<200 words), produce 1–2 cards.
- Use these card types:
  * "text" — formatted prose (primary type, rendered as Markdown)
  * "key_points" — a structured list of key takeaways (use when there are 3+ distinct points)
  * "quote" — a notable, memorable quote from the source
- If the article contains a powerful quote, include one "quote" card.
- If there are 3+ clear takeaways, include a "key_points" card.
- Do NOT include your own opinions.
- Titles should be concise (max 10 words), descriptive, and engaging.

IMPORTANT:
Respond ONLY with a single valid JSON object. No markdown, no code fences, no explanation.
Start your response with "{" and end with "}". If you include markdown or code fences, I will scream at you.

Example output:
{
  "title": "string",
  "cards": [
    { "type": "text", "content": "string" },
    { "type": "key_points", "items": ["string", "string"] },
    { "type": "quote", "content": "string", "attribution": "optional string" }
  ]
}`;

const RESEARCH_SYSTEM_PROMPT = `You are a knowledgeable research assistant. 
Your task is to provide a comprehensive, well-structured overview of the given topic.
Write factual, informative content covering: what it is, why it matters, key concepts, and recent developments.
Write in clear prose, around 400–800 words. Do not use bullet lists. Do not add opinions.`;

// ---------------------------------------------------------------------------
// JSON parsing with validation
// ---------------------------------------------------------------------------

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

function parseAndValidateLLMOutput(raw: string): LLMCardOutput {
  const rawTrimmed = raw.trim()
    .replace(/^```json/, '')
    .replace(/```$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawTrimmed);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('LLM response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj['title'] !== 'string' || obj['title'].trim() === '') {
    throw new Error('LLM response missing or empty "title" field');
  }

  if (!Array.isArray(obj['cards']) || obj['cards'].length === 0) {
    throw new Error('LLM response missing or empty "cards" array');
  }

  const cards: LLMCardItem[] = [];
  for (const card of obj['cards'] as unknown[]) {
    if (typeof card !== 'object' || card === null) {
      throw new Error('Card is not an object');
    }
    const c = card as Record<string, unknown>;

    if (c['type'] === 'text') {
      if (typeof c['content'] !== 'string') throw new Error('text card missing content');
      cards.push({ type: 'text', content: c['content'] });
    } else if (c['type'] === 'key_points') {
      if (!isStringArray(c['items'])) throw new Error('key_points card missing items array');
      cards.push({ type: 'key_points', items: c['items'] });
    } else if (c['type'] === 'quote') {
      if (typeof c['content'] !== 'string') throw new Error('quote card missing content');
      const attribution = typeof c['attribution'] === 'string' ? c['attribution'] : undefined;
      cards.push({ type: 'quote', content: c['content'], attribution });
    } else if (c['type'] === 'image') {
      if (typeof c['url'] !== 'string') throw new Error('image card missing url');
      const caption = typeof c['caption'] === 'string' ? c['caption'] : undefined;
      cards.push({ type: 'image', url: c['url'], caption });
    } else {
      throw new Error(`Unknown card type: ${c['type']}`);
    }
  }

  return { title: (obj['title'] as string).trim(), cards };
}

// ---------------------------------------------------------------------------
// Strict retry prompt
// ---------------------------------------------------------------------------

const STRICT_RETRY_SUFFIX = `

IMPORTANT: Your previous response was not valid JSON. 
Respond ONLY with a single valid JSON object. No markdown, no code fences, no explanation.
Start your response with "{" and end with "}".`;

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

export class OpenAIProvider implements LLMProvider {
  private readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async callOpenAI(
    systemPrompt: string,
    userMessage: string,
    jsonMode: boolean,
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      temperature: 0.3,
      max_tokens: 2048,
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices[0]?.message?.content ?? '';
    return {
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  async summarize(content: string): Promise<LLMSummarizeResult> {
    const INPUT_COST_PER_TOKEN = 0.15 / 1_000_000;
    const OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000;

    let result: { content: string; inputTokens: number; outputTokens: number };
    let output: LLMCardOutput;
    let totalInput = 0;
    let totalOutput = 0;

    try {
      result = await this.callOpenAI(SYSTEM_PROMPT, content, true);
      totalInput += result.inputTokens;
      totalOutput += result.outputTokens;
      output = parseAndValidateLLMOutput(result.content);
    } catch (firstError) {
      console.warn('First LLM attempt failed, retrying:', firstError);
      try {
        result = await this.callOpenAI(
          SYSTEM_PROMPT + STRICT_RETRY_SUFFIX,
          content,
          true,
        );
        totalInput += result.inputTokens;
        totalOutput += result.outputTokens;
        output = parseAndValidateLLMOutput(result.content);
      } catch (retryError) {
        throw new Error(`LLM summarize failed after retry: ${retryError}`);
      }
    }

    const cost = totalInput * INPUT_COST_PER_TOKEN + totalOutput * OUTPUT_COST_PER_TOKEN;

    return {
      output,
      usage: {
        tokens_input: totalInput,
        tokens_output: totalOutput,
        cost_usd: cost,
        model_used: this.model,
      },
    };
  }

  async researchTopic(topic: string): Promise<string> {
    const result = await this.callOpenAI(
      RESEARCH_SYSTEM_PROMPT,
      `Write a comprehensive overview of this topic: ${topic}`,
      false,
    );
    return result.content;
  }
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LLMProvider {
  private readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model = 'claude-3-5-haiku-20241022') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async callAnthropic(
    systemPrompt: string,
    userMessage: string,
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const body = JSON.stringify({
      model: this.model,
      max_tokens: 2048,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const content = data.content.find((b) => b.type === 'text')?.text ?? '';
    return {
      content,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  }

  async summarize(content: string): Promise<LLMSummarizeResult> {
    const INPUT_COST_PER_TOKEN = 0.80 / 1_000_000;
    const OUTPUT_COST_PER_TOKEN = 4.00 / 1_000_000;

    let result: { content: string; inputTokens: number; outputTokens: number };
    let output: LLMCardOutput;
    let totalInput = 0;
    let totalOutput = 0;

    try {
      result = await this.callAnthropic(
        SYSTEM_PROMPT,
        `Summarize this article into cards:\n\n${content}`,
      );
      totalInput += result.inputTokens;
      totalOutput += result.outputTokens;
      output = parseAndValidateLLMOutput(result.content);
    } catch (firstError) {
      console.warn('First Anthropic attempt failed, retrying:', firstError);
      try {
        result = await this.callAnthropic(
          SYSTEM_PROMPT + STRICT_RETRY_SUFFIX,
          `Summarize this article into cards:\n\n${content}`,
        );
        totalInput += result.inputTokens;
        totalOutput += result.outputTokens;
        output = parseAndValidateLLMOutput(result.content);
      } catch (retryError) {
        throw new Error(`Anthropic summarize failed after retry: ${retryError}`);
      }
    }

    const cost = totalInput * INPUT_COST_PER_TOKEN + totalOutput * OUTPUT_COST_PER_TOKEN;

    return {
      output,
      usage: {
        tokens_input: totalInput,
        tokens_output: totalOutput,
        cost_usd: cost,
        model_used: this.model,
      },
    };
  }

  async researchTopic(topic: string): Promise<string> {
    const result = await this.callAnthropic(
      RESEARCH_SYSTEM_PROMPT,
      `Write a comprehensive overview of this topic: ${topic}`,
    );
    return result.content;
  }
}

// ---------------------------------------------------------------------------
// AWS Bedrock provider
// ---------------------------------------------------------------------------

const BEDROCK_COSTS: Record<string, { input: number; output: number }> = {
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': {
    input: 0.0008 / 1_000,
    output: 0.004 / 1_000,
  },
  'anthropic.claude-3-5-haiku-20241022-v1:0': {
    input: 0.0008 / 1_000,
    output: 0.004 / 1_000,
  },
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': {
    input: 0.003 / 1_000,
    output: 0.015 / 1_000,
  },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    input: 0.003 / 1_000,
    output: 0.015 / 1_000,
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    input: 0.00025 / 1_000,
    output: 0.00125 / 1_000,
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    input: 0.003 / 1_000,
    output: 0.015 / 1_000,
  },
  'amazon.nova-micro-v1:0': {
    input: 0.000035 / 1_000,
    output: 0.00014 / 1_000,
  },
  'amazon.nova-lite-v1:0': {
    input: 0.00006 / 1_000,
    output: 0.00024 / 1_000,
  },
  'amazon.nova-pro-v1:0': {
    input: 0.0008 / 1_000,
    output: 0.0032 / 1_000,
  },
};

export class BedrockProvider implements LLMProvider {
  private readonly model: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    model: string,
  ) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
    this.model = model;
  }

  private async callBedrock(
    systemPrompt: string,
    userMessage: string,
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const url = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${this.model}/converse`;

    const requestBody = JSON.stringify({
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: 'user',
          content: [{ text: userMessage }],
        },
      ],
      inferenceConfig: {
        maxTokens: 2048,
        temperature: 0.3,
      },
    });

    const signedHeaders = await signRequest({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/json' },
      body: requestBody,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      service: 'bedrock',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...signedHeaders,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bedrock API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
      output: {
        message: {
          content: Array<{ text?: string }>;
        };
      };
      usage: {
        inputTokens: number;
        outputTokens: number;
      };
    };

    const content = data.output?.message?.content?.find((b) => b.text !== undefined)?.text ?? '';
    return {
      content,
      inputTokens: data.usage?.inputTokens ?? 0,
      outputTokens: data.usage?.outputTokens ?? 0,
    };
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const rates = BEDROCK_COSTS[this.model];
    if (!rates) {
      console.warn(
        `[BedrockProvider] No pricing data for model "${this.model}". Cost recorded as $0.`,
      );
      return 0;
    }
    return inputTokens * rates.input + outputTokens * rates.output;
  }

  async summarize(content: string): Promise<LLMSummarizeResult> {
    let result: { content: string; inputTokens: number; outputTokens: number };
    let output: LLMCardOutput;
    let totalInput = 0;
    let totalOutput = 0;

    try {
      result = await this.callBedrock(
        SYSTEM_PROMPT,
        `Summarize this article into cards:\n\n${content}`,
      );
      totalInput += result.inputTokens;
      totalOutput += result.outputTokens;
      output = parseAndValidateLLMOutput(result.content);
    } catch (firstError) {
      console.warn('First Bedrock attempt failed, retrying:', firstError);
      try {
        result = await this.callBedrock(
          SYSTEM_PROMPT + STRICT_RETRY_SUFFIX,
          `Summarize this article into cards:\n\n${content}`,
        );
        totalInput += result.inputTokens;
        totalOutput += result.outputTokens;
        output = parseAndValidateLLMOutput(result.content);
      } catch (retryError) {
        throw new Error(`Bedrock summarize failed after retry: ${retryError}`);
      }
    }

    const cost = this.calculateCost(totalInput, totalOutput);

    return {
      output,
      usage: {
        tokens_input: totalInput,
        tokens_output: totalOutput,
        cost_usd: cost,
        model_used: this.model,
      },
    };
  }

  async researchTopic(topic: string): Promise<string> {
    const result = await this.callBedrock(
      RESEARCH_SYSTEM_PROMPT,
      `Write a comprehensive overview of this topic: ${topic}`,
    );
    return result.content;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export function createLLMProvider(
  provider: string,
  apiKey: string,
  model: string,
): LLMProvider {
  if (provider === 'openai') {
    return new OpenAIProvider(apiKey, model);
  } else if (provider === 'anthropic') {
    return new AnthropicProvider(apiKey, model);
  } else if (provider === 'bedrock') {
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';
    const region = Deno.env.get('AWS_REGION') ?? 'us-east-1';
    return new BedrockProvider(accessKeyId, secretAccessKey, region, model);
  }
  throw new Error(`Unknown LLM provider: "${provider}". Use "openai", "anthropic", or "bedrock".`);
}
