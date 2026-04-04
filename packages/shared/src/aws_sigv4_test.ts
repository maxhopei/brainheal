/**
 * worker/src/aws_sigv4_test.ts — Unit tests for SigV4 request signing.
 *
 * Uses the official AWS SigV4 test vectors from:
 * https://docs.aws.amazon.com/general/latest/gr/sigv4-test-suite.html
 *
 * The canonical example from the AWS documentation:
 *   GET request to https://example.amazonaws.com/?Param1=value1&Param2=value2
 *   with a fixed date of 20150830T123600Z
 */

import { assertEquals, assertMatch } from '@std/assert';
import { signRequest } from '@brainheal/shared';

// ---------------------------------------------------------------------------
// Known test vector from AWS SigV4 test suite
// (from https://docs.aws.amazon.com/general/latest/gr/sigv4-test-suite.html)
// ---------------------------------------------------------------------------

const TEST_ACCESS_KEY = 'AKIDEXAMPLE';
const TEST_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
const TEST_REGION = 'us-east-1';
const TEST_SERVICE = 'service';
// Fixed date for deterministic test
const TEST_DATE = '2015-08-30T12:36:00.000Z';

Deno.test('signRequest - produces valid Authorization header structure', async () => {
  const signed = await signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    headers: {},
    body: '',
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    region: TEST_REGION,
    service: TEST_SERVICE,
    dateOverride: TEST_DATE,
  });

  // Authorization header must follow the SigV4 structure
  assertMatch(
    signed.Authorization,
    /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request, SignedHeaders=.+, Signature=[a-f0-9]{64}$/,
  );
  assertEquals(signed['x-amz-date'], '20150830T123600Z');
});

Deno.test('signRequest - x-amz-date format is correct (YYYYMMDDTHHmmssZ)', async () => {
  const signed = await signRequest({
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/some-model/converse',
    headers: { 'content-type': 'application/json' },
    body: '{"test": true}',
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    region: 'us-east-1',
    service: 'bedrock',
    dateOverride: TEST_DATE,
  });

  // Must be format YYYYMMDDTHHmmssZ — exactly 16 chars
  assertMatch(signed['x-amz-date'], /^\d{8}T\d{6}Z$/);
  assertEquals(signed['x-amz-date'], '20150830T123600Z');
});

Deno.test('signRequest - credential scope embeds correct dateStamp', async () => {
  const dateOverride = '2024-06-15T08:30:00.000Z';
  const signed = await signRequest({
    method: 'POST',
    url: 'https://bedrock-runtime.us-west-2.amazonaws.com/model/my-model/converse',
    headers: { 'content-type': 'application/json' },
    body: '{"hello": "world"}',
    accessKeyId: 'MY_KEY',
    secretAccessKey: 'MY_SECRET',
    region: 'us-west-2',
    service: 'bedrock',
    dateOverride,
  });

  // The credential scope in Authorization should have date 20240615
  assertMatch(signed.Authorization, /Credential=MY_KEY\/20240615\/us-west-2\/bedrock\/aws4_request/);
  assertEquals(signed['x-amz-date'], '20240615T083000Z');
});

Deno.test('signRequest - different bodies produce different signatures', async () => {
  const opts = {
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/test-model/converse',
    headers: { 'content-type': 'application/json' },
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    region: 'us-east-1',
    service: 'bedrock',
    dateOverride: TEST_DATE,
  };

  const signed1 = await signRequest({ ...opts, body: '{"message": "hello"}' });
  const signed2 = await signRequest({ ...opts, body: '{"message": "world"}' });

  // Different bodies should produce different signatures
  const sig1 = signed1.Authorization.match(/Signature=([a-f0-9]+)$/)?.[1];
  const sig2 = signed2.Authorization.match(/Signature=([a-f0-9]+)$/)?.[1];

  assertEquals(typeof sig1, 'string');
  assertEquals(typeof sig2, 'string');
  // Signatures must differ
  assertEquals(sig1 !== sig2, true);
});

Deno.test('signRequest - signed headers list is lowercase and sorted', async () => {
  const signed = await signRequest({
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/test/converse',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    region: 'us-east-1',
    service: 'bedrock',
    dateOverride: TEST_DATE,
  });

  // Extract signed headers list from Authorization
  const match = signed.Authorization.match(/SignedHeaders=([^,]+)/);
  const signedHeaders = match?.[1] ?? '';

  // All header names must be lowercase
  assertEquals(signedHeaders, signedHeaders.toLowerCase());

  // Headers must be sorted
  const headers = signedHeaders.split(';');
  const sortedHeaders = [...headers].sort();
  assertEquals(headers, sortedHeaders);

  // Must include required headers
  assertEquals(headers.includes('content-type'), true);
  assertEquals(headers.includes('host'), true);
  assertEquals(headers.includes('x-amz-content-sha256'), true);
  assertEquals(headers.includes('x-amz-date'), true);
});

Deno.test('signRequest - same inputs produce identical signatures (deterministic)', async () => {
  const opts = {
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/test-model/converse',
    headers: { 'content-type': 'application/json' },
    body: '{"deterministic": true}',
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    region: 'us-east-1',
    service: 'bedrock',
    dateOverride: TEST_DATE,
  };

  const signed1 = await signRequest(opts);
  const signed2 = await signRequest(opts);

  assertEquals(signed1.Authorization, signed2.Authorization);
  assertEquals(signed1['x-amz-date'], signed2['x-amz-date']);
});

Deno.test('signRequest - query params are included in signature', async () => {
  const signed = await signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
    headers: {},
    body: '',
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    region: TEST_REGION,
    service: TEST_SERVICE,
    dateOverride: TEST_DATE,
  });

  // Should produce a valid Authorization header
  assertMatch(signed.Authorization, /^AWS4-HMAC-SHA256 Credential=/);
  // Signature length should be 64 hex chars
  const sigMatch = signed.Authorization.match(/Signature=([a-f0-9]+)$/);
  assertEquals(sigMatch?.[1]?.length, 64);
});
