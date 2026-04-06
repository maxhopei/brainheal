import type { LLMCardOutput } from '@brainheal/shared';
import type { LLMProvider, LLMSummarizeResult } from '../llm-provider.ts';
import { RESEARCH_SYSTEM_PROMPT, STRICT_RETRY_SUFFIX, SYSTEM_PROMPT } from '../prompts.ts';
import { signRequest } from './sigv4.ts';
import { parseAndValidateLLMOutput } from '../parse.ts';
import { BEDROCK_COSTS } from './costs.ts';

/**
 * AWS Bedrock provider (Converse API)
 */
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

  /**
   * Calculates cost in USD for a Bedrock call.
   * Falls back to 0 with a warning if the model is not in the pricing table.
   */
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
