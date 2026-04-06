/**
 * Unit tests for BedrockProvider.
 *
 * All tests use a mocked `fetch` to avoid real API calls.
 * Tests verify: correct URL construction, SigV4 headers, request body format,
 * response parsing, cost calculation, error handling, and retry logic.
 */

import { assertEquals, assertInstanceOf, assertMatch, assertRejects } from '@std/assert'
import { BedrockProvider } from './provider.ts'
import { createLLMProvider } from '../llm-factory.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockFetchCall = {
  url: string
  options: RequestInit
}

/**
 * Replaces globalThis.fetch with a mock that returns a pre-configured response.
 * Returns an array that accumulates all calls made to the mock.
 * Call `restore()` to restore the original fetch.
 */
function mockFetch(
  response: { status: number; body: unknown },
): { calls: MockFetchCall[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: MockFetchCall[] = [] // deno-lint-ignore no-explicit-any
  ;(globalThis as any).fetch = async (url: string | URL | Request, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url
    calls.push({ url: urlStr, options: options ?? {} })

    const bodyStr = typeof response.body === 'string' ? response.body : JSON.stringify(response.body)

    return new Response(bodyStr, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    })
  }

  return {
    calls,
    restore: () => {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).fetch = original
    },
  }
}

/**
 * Creates a successful Bedrock Converse API response fixture.
 */
function makeBedrockResponse(text: string, inputTokens = 100, outputTokens = 200): unknown {
  return {
    output: {
      message: {
        role: 'assistant',
        content: [{ type: 'text', text }],
      },
    },
    stopReason: 'end_turn',
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  }
}

/** A minimal valid LLM card output JSON string */
const VALID_CARDS_JSON = JSON.stringify({
  title: 'Test Article Summary',
  cards: [
    { type: 'text', content: 'This is the main takeaway from the article.' },
    {
      type: 'key_points',
      items: ['First key point', 'Second key point', 'Third key point'],
    },
  ],
})

// ---------------------------------------------------------------------------
// BedrockProvider constructor tests
// ---------------------------------------------------------------------------

Deno.test('BedrockProvider - instantiates with default model and region', () => {
  const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
  assertInstanceOf(provider, BedrockProvider)
  assertEquals(typeof provider.summarize, 'function')
  assertEquals(typeof provider.researchTopic, 'function')
})

Deno.test('BedrockProvider - instantiates with custom model and region', () => {
  const provider = new BedrockProvider(
    'AKID',
    'SECRET',
    'eu-west-1',
    'anthropic.claude-3-sonnet-20240229-v1:0',
  )
  assertInstanceOf(provider, BedrockProvider)
})

// ---------------------------------------------------------------------------
// createLLMProvider factory tests
// ---------------------------------------------------------------------------

Deno.test('createLLMProvider - returns BedrockProvider for "bedrock"', () => {
  const provider = createLLMProvider('bedrock', 'test-model', {
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    region: 'us-east-1',
  })
  assertInstanceOf(provider, BedrockProvider)
  assertEquals(typeof provider.summarize, 'function')
  assertEquals(typeof provider.researchTopic, 'function')
})

Deno.test('createLLMProvider - bedrock provider with custom model', () => {
  const provider = createLLMProvider('bedrock', 'test-model', {
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    region: 'us-west-2',
  })
  assertInstanceOf(provider, BedrockProvider)
})

Deno.test('createLLMProvider - throws for unknown provider (updated message)', () => {
  let thrown = false
  try {
    createLLMProvider('unknown-xyz', 'test-model', 'key', )
  } catch (err) {
    thrown = true
    assertMatch(
      (err as Error).message,
      /Use "openai", "anthropic", or "bedrock"/,
    )
  }
  assertEquals(thrown, true)
})

// ---------------------------------------------------------------------------
// summarize() tests
// ---------------------------------------------------------------------------

Deno.test('BedrockProvider.summarize - calls correct Bedrock Converse API URL', async () => {
  const { calls, restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON),
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1', 'test-model')
    await provider.summarize('Test article content.')

    assertEquals(calls.length, 1)
    assertMatch(
      calls[0].url,
      /^https:\/\/bedrock-runtime\.us-east-1\.amazonaws\.com\/model\/.+\/converse$/,
    )
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - uses custom region in URL', async () => {
  const { calls, restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON),
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'eu-central-1', 'test-model')
    await provider.summarize('Test content')

    assertEquals(calls.length, 1)
    assertMatch(calls[0].url, /bedrock-runtime\.eu-central-1\.amazonaws\.com/)
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - request includes SigV4 Authorization header', async () => {
  const { calls, restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON),
  })

  try {
    const provider = new BedrockProvider('AKID123', 'SECRET456', 'us-east-1', 'test-model')
    await provider.summarize('Test content')

    const headers = calls[0].options.headers as Record<string, string>
    assertEquals(typeof headers['Authorization'], 'string')
    assertMatch(headers['Authorization'], /^AWS4-HMAC-SHA256 Credential=AKID123\//)
    assertMatch(headers['Authorization'], /Signature=[a-f0-9]{64}$/)
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - request includes x-amz-date header', async () => {
  const { calls, restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON),
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1', 'test-model')
    await provider.summarize('Test')

    const headers = calls[0].options.headers as Record<string, string>
    assertEquals(typeof headers['x-amz-date'], 'string')
    assertMatch(headers['x-amz-date'], /^\d{8}T\d{6}Z$/)
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - sends correct Converse API request body', async () => {
  const { calls, restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON),
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1', 'test-model')
    await provider.summarize('My article content here')

    const body = JSON.parse(calls[0].options.body as string)
    // Must have system prompt
    assertEquals(Array.isArray(body.system), true)
    assertEquals(typeof body.system[0].text, 'string')
    // Must have messages array with user role
    assertEquals(Array.isArray(body.messages), true)
    assertEquals(body.messages[0].role, 'user')
    // User message content should include the article
    const userText = body.messages[0].content[0].text as string
    assertEquals(userText.includes('My article content here'), true)
    // Must include inference config
    assertEquals(typeof body.inferenceConfig, 'object')
    assertEquals(body.inferenceConfig.maxTokens, 2048)
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - parses response and returns LLMSummarizeResult', async () => {
  const { restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON, 150, 250),
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
    const result = await provider.summarize('Article content')

    assertEquals(result.output.title, 'Test Article Summary')
    assertEquals(result.output.cards.length, 2)
    assertEquals(result.output.cards[0].type, 'text')
    assertEquals(result.output.cards[1].type, 'key_points')
    assertEquals(result.usage.tokens_input, 150)
    assertEquals(result.usage.tokens_output, 250)
    assertEquals(typeof result.usage.cost_usd, 'number')
    assertEquals(result.usage.cost_usd > 0, true)
    assertEquals(result.usage.model_used, 'us.anthropic.claude-3-5-haiku-20241022-v1:0')
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - calculates cost correctly for known model', async () => {
  const { restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON, 1_000_000, 1_000_000),
  })

  try {
    // Default model: anthropic.claude-3-5-haiku-20241022-v1:0
    // Input: $0.0008/1k = $0.8/1M, Output: $0.004/1k = $4/1M
    // For 1M input + 1M output → 0.8 + 4 = $4.8
    const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
    const result = await provider.summarize('Content')

    // Allow small float rounding
    const expectedCost = (0.0008 / 1_000) * 1_000_000 + (0.004 / 1_000) * 1_000_000
    assertEquals(Math.abs(result.usage.cost_usd - expectedCost) < 0.0001, true)
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - cost is 0 for unknown model (with warning)', async () => {
  const { restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse(VALID_CARDS_JSON, 100, 200),
  })

  // Capture console.warn calls
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(' '))
  }

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'us-east-1', 'unknown-model-xyz')
    const result = await provider.summarize('Content')

    assertEquals(result.usage.cost_usd, 0)
    // Should have logged a warning about unknown model
    assertEquals(
      warnings.some((w) => w.includes('unknown-model-xyz') || w.includes('No pricing')),
      true,
    )
  } finally {
    restore()
    console.warn = originalWarn
  }
})

Deno.test('BedrockProvider.summarize - retries once on malformed JSON response', async () => {
  let callCount = 0
  const originalFetch = globalThis.fetch // deno-lint-ignore no-explicit-any
  ;(globalThis as any).fetch = async (_url: string | URL | Request, _options?: RequestInit) => {
    callCount++
    // First call returns garbage JSON; second returns valid JSON
    const body = callCount === 1
      ? makeBedrockResponse('not valid json at all!!!')
      : makeBedrockResponse(VALID_CARDS_JSON)

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
    const result = await provider.summarize('Content')

    assertEquals(callCount, 2)
    assertEquals(result.output.title, 'Test Article Summary')
  } finally {
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).fetch = originalFetch
  }
})

Deno.test('BedrockProvider.summarize - throws after two failures', async () => {
  const { restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse('{ "broken": true }'), // missing title and cards
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
    await assertRejects(
      () => provider.summarize('Content'),
      Error,
      'Bedrock summarize failed after retry',
    )
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.summarize - throws on HTTP error response', async () => {
  const { restore } = mockFetch({
    status: 403,
    body: { message: 'UnauthorizedException: no access' },
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
    await assertRejects(
      () => provider.summarize('Content'),
      Error,
      'Bedrock API error 403',
    )
  } finally {
    restore()
  }
})

// ---------------------------------------------------------------------------
// researchTopic() tests
// ---------------------------------------------------------------------------

Deno.test('BedrockProvider.researchTopic - calls Bedrock and returns text content', async () => {
  const { calls, restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse('This is a comprehensive overview of quantum computing.', 50, 300),
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'ap-southeast-1', 'test-model')
    const result = await provider.researchTopic('quantum computing')

    assertEquals(result, 'This is a comprehensive overview of quantum computing.')
    assertEquals(calls.length, 1)
    assertMatch(calls[0].url, /bedrock-runtime\.ap-southeast-1\.amazonaws\.com/)
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.researchTopic - sends research system prompt', async () => {
  const { calls, restore } = mockFetch({
    status: 200,
    body: makeBedrockResponse('Overview of climate change...'),
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
    await provider.researchTopic('climate change')

    const body = JSON.parse(calls[0].options.body as string)
    // Research system prompt should mention "research assistant" or similar
    const systemText = body.system[0].text as string
    assertEquals(systemText.toLowerCase().includes('research'), true)
    // User message should contain the topic
    const userText = body.messages[0].content[0].text as string
    assertEquals(userText.includes('climate change'), true)
  } finally {
    restore()
  }
})

Deno.test('BedrockProvider.researchTopic - throws on HTTP error', async () => {
  const { restore } = mockFetch({
    status: 500,
    body: { message: 'Internal Server Error' },
  })

  try {
    const provider = new BedrockProvider('AKID', 'SECRET', 'test-region', 'test-model')
    await assertRejects(
      () => provider.researchTopic('some topic'),
      Error,
      'Bedrock API error 500',
    )
  } finally {
    restore()
  }
})
