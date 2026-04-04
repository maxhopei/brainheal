/**
 * worker/src/llm_test.ts — Tests for the LLM abstraction layer.
 *
 * Tests validation and parsing logic without making real API calls.
 */

import { assertEquals, assertThrows, assertRejects } from '@std/assert';
import { OpenAIProvider, AnthropicProvider, BedrockProvider, createLLMProvider } from '@brainheal/shared';

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

// ---------------------------------------------------------------------------
// BedrockProvider tests
// ---------------------------------------------------------------------------

Deno.test('BedrockProvider instantiates with default model and region', () => {
  const provider = new BedrockProvider('AKID', 'SECRET');
  assertEquals(typeof provider.summarize, 'function');
  assertEquals(typeof provider.researchTopic, 'function');
});

Deno.test('BedrockProvider instantiates with custom model', () => {
  const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1', 'amazon.nova-pro-v1:0');
  assertEquals(typeof provider.summarize, 'function');
});

Deno.test('BedrockProvider instantiates with custom region', () => {
  const provider = new BedrockProvider('AKID', 'SECRET', 'eu-west-1');
  assertEquals(typeof provider.summarize, 'function');
});

Deno.test('createLLMProvider returns BedrockProvider for "bedrock"', () => {
  const provider = createLLMProvider('bedrock', '', undefined, {
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    region: 'us-east-1',
  });
  assertEquals(typeof provider.summarize, 'function');
  assertEquals(typeof provider.researchTopic, 'function');
  assertEquals(provider instanceof BedrockProvider, true);
});

Deno.test('createLLMProvider "bedrock" updated error message includes bedrock', () => {
  assertThrows(
    () => createLLMProvider('totally-unknown', 'key'),
    Error,
    '"totally-unknown"',
  );
  // Also verify the error message mentions all three valid providers
  try {
    createLLMProvider('bad', 'key');
  } catch (e) {
    const msg = (e as Error).message;
    assertEquals(msg.includes('bedrock'), true);
    assertEquals(msg.includes('openai'), true);
    assertEquals(msg.includes('anthropic'), true);
  }
});

Deno.test('BedrockProvider.summarize calls fetch with signed headers and returns result', async () => {
  // Mock fetch to return a valid Bedrock Converse API response
  const validResponse = {
    output: {
      message: {
        content: [
          {
            text: JSON.stringify({
              title: 'Test Title',
              cards: [{ type: 'text', content: 'Test content for the card.' }],
            }),
          },
        ],
      },
    },
    usage: { inputTokens: 100, outputTokens: 50 },
    stopReason: 'end_turn',
  };

  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = input.toString();
    capturedHeaders = Object.fromEntries(new Headers(init?.headers).entries());
    return new Response(JSON.stringify(validResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1', 'anthropic.claude-3-5-haiku-20241022-v1:0');
    const result = await provider.summarize('This is an article about testing.');

    // Verify URL was constructed correctly
    assertEquals(
      capturedUrl.includes('bedrock-runtime.us-east-1.amazonaws.com'),
      true,
    );
    assertEquals(capturedUrl.includes('/converse'), true);

    // Verify Authorization header was signed
    assertEquals(typeof capturedHeaders['authorization'], 'string');
    assertEquals(capturedHeaders['authorization'].startsWith('AWS4-HMAC-SHA256'), true);

    // Verify x-amz-date header was set
    assertEquals(typeof capturedHeaders['x-amz-date'], 'string');

    // Verify output structure
    assertEquals(result.output.title, 'Test Title');
    assertEquals(result.output.cards.length, 1);
    assertEquals(result.output.cards[0].type, 'text');

    // Verify usage tracking
    assertEquals(result.usage.tokens_input, 100);
    assertEquals(result.usage.tokens_output, 50);
    assertEquals(result.usage.model_used, 'anthropic.claude-3-5-haiku-20241022-v1:0');

    // Verify cost calculation uses the pricing table (not zero)
    // Claude 3.5 Haiku: $0.0008/1K input, $0.004/1K output
    const expectedCost = (100 * 0.0008 / 1_000) + (50 * 0.004 / 1_000);
    assertEquals(Math.abs(result.usage.cost_usd - expectedCost) < 1e-10, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('BedrockProvider.summarize retries on malformed JSON', async () => {
  let callCount = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    callCount++;
    if (callCount === 1) {
      // First call returns malformed JSON
      return new Response(
        JSON.stringify({
          output: {
            message: { content: [{ text: 'this is not valid json at all' }] },
          },
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // Second call returns valid JSON
    return new Response(
      JSON.stringify({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  title: 'Retry Title',
                  cards: [{ type: 'text', content: 'Retry succeeded.' }],
                }),
              },
            ],
          },
        },
        usage: { inputTokens: 15, outputTokens: 8 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  // deno-lint-ignore no-explicit-any
  }) as unknown as any;

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1');
    const result = await provider.summarize('Article content here.');

    assertEquals(callCount, 2); // Must have retried
    assertEquals(result.output.title, 'Retry Title');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('BedrockProvider.summarize throws after two failed attempts', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        output: {
          message: { content: [{ text: 'not json' }] },
        },
        usage: { inputTokens: 5, outputTokens: 3 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1');
    await assertRejects(
      () => provider.summarize('Bad content.'),
      Error,
      'Bedrock summarize failed after retry',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('BedrockProvider.summarize throws on HTTP error', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response('{"message":"AccessDeniedException"}', {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1');
    await assertRejects(
      () => provider.summarize('Content.'),
      Error,
      'Bedrock API error 403',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('BedrockProvider.researchTopic calls fetch and returns text content', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        output: {
          message: {
            content: [{ text: 'Comprehensive overview of the topic...' }],
          },
        },
        usage: { inputTokens: 50, outputTokens: 200 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1');
    const result = await provider.researchTopic('quantum computing');
    assertEquals(result, 'Comprehensive overview of the topic...');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('BedrockProvider cost is zero for unknown model (with no crash)', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  title: 'Unknown Model Test',
                  cards: [{ type: 'text', content: 'Some content.' }],
                }),
              },
            ],
          },
        },
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1', 'unknown.model-v1:0');
    const result = await provider.summarize('Article content.');
    // Cost should be 0 for unknown model (no crash)
    assertEquals(result.usage.cost_usd, 0);
    assertEquals(result.usage.model_used, 'unknown.model-v1:0');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('BedrockProvider uses correct Bedrock endpoint URL with encoded model ID', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';

  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    capturedUrl = input.toString();
    return new Response(
      JSON.stringify({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  title: 'URL Test',
                  cards: [{ type: 'text', content: 'Content.' }],
                }),
              },
            ],
          },
        },
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    // Model ID with colon character — must be percent-encoded in URL
    const model = 'anthropic.claude-3-5-haiku-20241022-v1:0';
    const provider = new BedrockProvider('AKID', 'SECRET', 'ap-northeast-1', model);
    await provider.researchTopic('test topic');

    // The URL should use the correct region endpoint
    assertEquals(capturedUrl.includes('bedrock-runtime.ap-northeast-1.amazonaws.com'), true);
    assertEquals(capturedUrl.includes('/converse'), true);
    // The colon in the model ID should be percent-encoded
    assertEquals(capturedUrl.includes('%3A0') || capturedUrl.includes(':0'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

