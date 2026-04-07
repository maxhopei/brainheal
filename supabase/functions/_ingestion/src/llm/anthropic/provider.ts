import type { LLMCardOutput, LLMProvider, LLMSummarizeResult } from '../provider.ts'
import { RESEARCH_SYSTEM_PROMPT, STRICT_RETRY_SUFFIX, SYSTEM_PROMPT } from '../prompts.ts'
import { parseAndValidateLLMOutput } from '../parse.ts'

export class AnthropicProvider implements LLMProvider {
  private readonly model: string
  private readonly apiKey: string

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
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
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${errText}`)
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>
      usage: { input_tokens: number; output_tokens: number }
    }

    const content = data.content.find((b) => b.type === 'text')?.text ?? ''
    return {
      content,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    }
  }

  async summarize(content: string): Promise<LLMSummarizeResult> {
    // Cost rates for claude-3-5-haiku (per 1M tokens as of 2025)
    const INPUT_COST_PER_TOKEN = 0.80 / 1_000_000
    const OUTPUT_COST_PER_TOKEN = 4.00 / 1_000_000

    let result: { content: string; inputTokens: number; outputTokens: number }
    let output: LLMCardOutput
    let totalInput = 0
    let totalOutput = 0

    try {
      result = await this.callAnthropic(
        SYSTEM_PROMPT,
        `Summarize this article into cards:\n\n${content}`,
      )
      totalInput += result.inputTokens
      totalOutput += result.outputTokens
      output = parseAndValidateLLMOutput(result.content)
    } catch (firstError) {
      console.warn('First Anthropic attempt failed, retrying:', firstError)
      try {
        result = await this.callAnthropic(
          SYSTEM_PROMPT + STRICT_RETRY_SUFFIX,
          `Summarize this article into cards:\n\n${content}`,
        )
        totalInput += result.inputTokens
        totalOutput += result.outputTokens
        output = parseAndValidateLLMOutput(result.content)
      } catch (retryError) {
        throw new Error(`Anthropic summarize failed after retry: ${retryError}`)
      }
    }

    const cost = totalInput * INPUT_COST_PER_TOKEN + totalOutput * OUTPUT_COST_PER_TOKEN

    return {
      output,
      usage: {
        tokens_input: totalInput,
        tokens_output: totalOutput,
        cost_usd: cost,
        model_used: this.model,
      },
    }
  }

  async researchTopic(topic: string): Promise<string> {
    const result = await this.callAnthropic(
      RESEARCH_SYSTEM_PROMPT,
      `Write a comprehensive overview of this topic: ${topic}`,
    )
    return result.content
  }
}
