import type { LLMProvider } from './llm-provider.ts';
import { OpenAIProvider } from './openai/provider.ts';
import { AnthropicProvider } from './anthropic/provider.ts';
import { BedrockProvider } from './aws-bedrock/provider.ts';

export type BedrockCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

/**
 * Creates an LLM provider instance based on the provider name and credentials.
 *
 * For "openai" and "anthropic": pass apiKey as the second argument.
 * For "bedrock": pass the AWS credentials object as bedrockCredentials.
 *   apiKey is ignored when provider is "bedrock".
 */
export function createLLMProvider(
  provider: string,
  apiKey: string,
  model: string,
  bedrockCredentials?: BedrockCredentials,
): LLMProvider {
  if (provider === 'openai') {
    return new OpenAIProvider(apiKey, model);
  } else if (provider === 'anthropic') {
    return new AnthropicProvider(apiKey, model);
  } else if (provider === 'bedrock') {
    if (!bedrockCredentials) {
      throw new Error(`Bedrock credentials are required for the "bedrock" provider.`);
    }
    return new BedrockProvider(
      bedrockCredentials.accessKeyId,
      bedrockCredentials.secretAccessKey,
      bedrockCredentials.region,
      model,
    );
  }
  throw new Error(`Unknown LLM provider: "${provider}". Use "openai", "anthropic", or "bedrock".`);
}
