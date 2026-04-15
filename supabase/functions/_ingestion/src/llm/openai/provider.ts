import type { LLMCardOutput, LLMProvider, LLMSummarizeResult, ParentContext } from '../provider.ts'
import {
  buildReadNextResearchPrompt,
  buildReadNextSystemPrompt,
  RESEARCH_SYSTEM_PROMPT,
  STRICT_RETRY_SUFFIX,
  SYSTEM_PROMPT,
} from '../prompts.ts'
import { parseAndValidateLLMOutput } from '../parse.ts'

export class OpenAIProvider implements LLMProvider {
  private readonly model: string
  private readonly apiKey: string

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey
    this.model = model
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
    })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${errText}`)
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
      usage: { prompt_tokens: number; completion_tokens: number }
    }

    const content = data.choices[0]?.message?.content ?? ''
    return {
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    }
  }

  async summarize(content: string, parentContext?: ParentContext): Promise<LLMSummarizeResult> {
    // Cost rates for gpt-4o-mini (per 1M tokens as of 2025)
    const INPUT_COST_PER_TOKEN = 0.15 / 1_000_000
    const OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000

    const systemPrompt = parentContext ? buildReadNextSystemPrompt(parentContext) : SYSTEM_PROMPT

    let result: { content: string; inputTokens: number; outputTokens: number }
    let output: LLMCardOutput
    let totalInput = 0
    let totalOutput = 0

    try {
      result = await this.callOpenAI(systemPrompt, content, true)
      totalInput += result.inputTokens
      totalOutput += result.outputTokens
      output = parseAndValidateLLMOutput(result.content)
    } catch (firstError) {
      // Retry once with stricter prompt
      console.warn('First LLM attempt failed, retrying:', firstError)
      try {
        result = await this.callOpenAI(
          systemPrompt + STRICT_RETRY_SUFFIX,
          content,
          true,
        )
        totalInput += result.inputTokens
        totalOutput += result.outputTokens
        output = parseAndValidateLLMOutput(result.content)
      } catch (retryError) {
        throw new Error(`LLM summarize failed after retry: ${retryError}`)
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

  async researchTopic(topic: string, parentContext?: ParentContext): Promise<string> {
    const systemPrompt = parentContext ? buildReadNextResearchPrompt(parentContext) : RESEARCH_SYSTEM_PROMPT
    const userMessage = parentContext
      ? `Research this term in the context described above: ${topic}`
      : `Write a comprehensive overview of this topic: ${topic}`

    const result = await this.callOpenAI(systemPrompt, userMessage, false)
    return result.content
  }
}
