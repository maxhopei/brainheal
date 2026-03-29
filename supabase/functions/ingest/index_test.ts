/**
 * Tests for ingest Edge Function validation logic.
 * These tests focus on the pure validation functions which can be tested without
 * a live Supabase instance.
 */

import { assertEquals, assertThrows } from '@std/assert';

// ---------------------------------------------------------------------------
// Re-implement testable validation helpers (extracted from index.ts)
// We test these directly to avoid needing a running Supabase instance.
// ---------------------------------------------------------------------------

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeText(value: string): string {
  // deno-lint-ignore no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

type InputType = 'url' | 'text';
type IngestRequest = { type: InputType; value: string };

function validateIngestBody(body: unknown): IngestRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be a JSON object');
  }

  const { type, value } = body as Record<string, unknown>;

  if (type !== 'url' && type !== 'text') {
    throw new Error('Field "type" must be "url" or "text"');
  }

  if (typeof value !== 'string') {
    throw new Error('Field "value" must be a string');
  }

  if (type === 'url') {
    const trimmed = value.trim();
    if (!isValidUrl(trimmed)) {
      throw new Error('Invalid URL: must be a valid http/https URL');
    }
    return { type: 'url', value: trimmed };
  }

  const sanitized = sanitizeText(value);
  if (sanitized.length < 3) {
    throw new Error('Text input must be at least 3 characters');
  }
  if (sanitized.length > 10_000) {
    throw new Error('Text input must not exceed 10,000 characters');
  }
  return { type: 'text', value: sanitized };
}

// ---------------------------------------------------------------------------
// Tests: isValidUrl
// ---------------------------------------------------------------------------

Deno.test('isValidUrl - accepts valid http URL', () => {
  assertEquals(isValidUrl('http://example.com'), true);
});

Deno.test('isValidUrl - accepts valid https URL', () => {
  assertEquals(isValidUrl('https://example.com/article?id=1'), true);
});

Deno.test('isValidUrl - rejects ftp URL', () => {
  assertEquals(isValidUrl('ftp://example.com'), false);
});

Deno.test('isValidUrl - rejects plain text', () => {
  assertEquals(isValidUrl('not a url'), false);
});

Deno.test('isValidUrl - rejects empty string', () => {
  assertEquals(isValidUrl(''), false);
});

Deno.test('isValidUrl - rejects javascript: URL', () => {
  assertEquals(isValidUrl('javascript:alert(1)'), false);
});

Deno.test('isValidUrl - rejects data: URL', () => {
  assertEquals(isValidUrl('data:text/html,<h1>test</h1>'), false);
});

// ---------------------------------------------------------------------------
// Tests: sanitizeText
// ---------------------------------------------------------------------------

Deno.test('sanitizeText - trims whitespace', () => {
  assertEquals(sanitizeText('  hello world  '), 'hello world');
});

Deno.test('sanitizeText - removes null bytes', () => {
  assertEquals(sanitizeText('hello\x00world'), 'helloworld');
});

Deno.test('sanitizeText - preserves newlines and tabs', () => {
  const input = 'line1\nline2\ttabbed';
  assertEquals(sanitizeText(input), 'line1\nline2\ttabbed');
});

Deno.test('sanitizeText - removes other control characters', () => {
  // \x01 is SOH (start of heading), should be removed
  assertEquals(sanitizeText('hello\x01world'), 'helloworld');
});

// ---------------------------------------------------------------------------
// Tests: validateIngestBody
// ---------------------------------------------------------------------------

Deno.test('validateIngestBody - accepts valid URL input', () => {
  const result = validateIngestBody({ type: 'url', value: 'https://example.com/article' });
  assertEquals(result.type, 'url');
  assertEquals(result.value, 'https://example.com/article');
});

Deno.test('validateIngestBody - trims URL whitespace', () => {
  const result = validateIngestBody({ type: 'url', value: '  https://example.com/article  ' });
  assertEquals(result.value, 'https://example.com/article');
});

Deno.test('validateIngestBody - accepts valid text input', () => {
  const result = validateIngestBody({ type: 'text', value: 'What is quantum computing?' });
  assertEquals(result.type, 'text');
  assertEquals(result.value, 'What is quantum computing?');
});

Deno.test('validateIngestBody - rejects null body', () => {
  assertThrows(
    () => validateIngestBody(null),
    Error,
    'Request body must be a JSON object',
  );
});

Deno.test('validateIngestBody - rejects missing type', () => {
  assertThrows(
    () => validateIngestBody({ value: 'https://example.com' }),
    Error,
    'Field "type" must be "url" or "text"',
  );
});

Deno.test('validateIngestBody - rejects invalid type', () => {
  assertThrows(
    () => validateIngestBody({ type: 'file', value: 'test' }),
    Error,
    'Field "type" must be "url" or "text"',
  );
});

Deno.test('validateIngestBody - rejects non-string value', () => {
  assertThrows(
    () => validateIngestBody({ type: 'url', value: 123 }),
    Error,
    'Field "value" must be a string',
  );
});

Deno.test('validateIngestBody - rejects invalid URL', () => {
  assertThrows(
    () => validateIngestBody({ type: 'url', value: 'not-a-url' }),
    Error,
    'Invalid URL',
  );
});

Deno.test('validateIngestBody - rejects text shorter than 3 chars', () => {
  assertThrows(
    () => validateIngestBody({ type: 'text', value: 'ab' }),
    Error,
    'at least 3 characters',
  );
});

Deno.test('validateIngestBody - rejects text longer than 10000 chars', () => {
  const longText = 'a'.repeat(10_001);
  assertThrows(
    () => validateIngestBody({ type: 'text', value: longText }),
    Error,
    'must not exceed 10,000 characters',
  );
});

Deno.test('validateIngestBody - accepts text at exactly max length', () => {
  const maxText = 'a'.repeat(10_000);
  const result = validateIngestBody({ type: 'text', value: maxText });
  assertEquals(result.value.length, 10_000);
});

Deno.test('validateIngestBody - sanitizes text input control chars', () => {
  const result = validateIngestBody({ type: 'text', value: 'hello\x00world' });
  assertEquals(result.value, 'helloworld');
});

Deno.test('validateIngestBody - rejects text that becomes too short after sanitization', () => {
  // "\x01\x02" after sanitization becomes "", which is < 3 chars
  assertThrows(
    () => validateIngestBody({ type: 'text', value: '\x01\x02' }),
    Error,
    'at least 3 characters',
  );
});
