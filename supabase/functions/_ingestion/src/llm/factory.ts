import type { LLMProvider } from './provider.ts'
import { OpenAIProvider } from './openai/provider.ts'
import { AnthropicProvider } from './anthropic/provider.ts'
import { BedrockProvider } from './aws-bedrock/provider.ts'

export type BedrockCredentials = {
  accessKeyId: string
  secretAccessKey: string
  region: string
}

/**
 * Creates an LLM provider instance based on the provider name and credentials.
 *
 * For "openai" and "anthropic": pass apiKey as the second argument.
 * For "bedrock": pass the AWS credentials object as bedrockCredentials.
 *   apiKey is ignored when provider is "bedrock".
 */
export function createLLMProvider<Provider extends string>(
  provider: Provider,
  model: string,
  credentials: Provider extends 'bedrock' ? BedrockCredentials : string,
): LLMProvider {
  if (provider === 'openai') {
    return new OpenAIProvider(credentials as string, model)
  } else if (provider === 'anthropic') {
    return new AnthropicProvider(credentials as string, model)
  } else if (provider === 'bedrock') {
    const { accessKeyId, secretAccessKey, region } = credentials as BedrockCredentials
    return new BedrockProvider(accessKeyId, secretAccessKey, region, model)
  }
  throw new Error(`Unknown LLM provider: "${provider}". Use "openai", "anthropic", or "bedrock".`)
}
