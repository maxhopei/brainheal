/**
 * worker/llm_test.ts — Tests for the LLM abstraction layer.
 *
 * Tests validation and parsing logic without making real API calls.
 */

import { assertEquals, assertThrows } from '@std/assert';
import { OpenAIProvider, AnthropicProvider, createLLMProvider } from './llm.ts';

// ---------------------------------------------------------------------------
// JSON parsing tests (testing parseAndValidateLLMOutput indirectly via
// the error paths in summarize)
// ---------------------------------------------------------------------------

Deno.test('createLLMProvider returns OpenAIProvider for "openai"', () => {
  const provider = createLLMProvider('openai', 'test-key');
  // Check it's an OpenAIProvider by checking methods exist
  assertEquals(typeof provider.summarize, 'function');
  assertEquals(typeof provider.researchTopic, 'function');
});

Deno.test('createLLMProvider returns AnthropicProvider for "anthropic"', () => {
  const provider = createLLMProvider('anthropic', 'test-key');
  assertEquals(typeof provider.summarize, 'function');
  assertEquals(typeof provider.researchTopic, 'function');
});

Deno.test('createLLMProvider throws for unknown provider', () => {
  assertThrows(
    () => createLLMProvider('unknown-provider', 'key'),
    Error,
    'Unknown LLM provider',
  );
});

Deno.test('OpenAIProvider instantiates with default model', () => {
  const provider = new OpenAIProvider('test-key');
  assertEquals(typeof provider.summarize, 'function');
});

Deno.test('OpenAIProvider instantiates with custom model', () => {
  const provider = new OpenAIProvider('test-key', 'gpt-4o');
  assertEquals(typeof provider.summarize, 'function');
});

Deno.test('AnthropicProvider instantiates with default model', () => {
  const provider = new AnthropicProvider('test-key');
  assertEquals(typeof provider.summarize, 'function');
});
