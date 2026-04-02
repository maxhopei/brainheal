/**
 * worker/src/aws_sigv4.ts — AWS Signature Version 4 (SigV4) request signing.
 *
 * Signs HTTP requests using AWS credentials and the SigV4 algorithm.
 * Uses the Web Crypto API (crypto.subtle) available natively in Deno — no SDK required.
 *
 * Reference: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SigV4Options = {
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Full URL including query string */
  url: string;
  /** Request headers (must include 'host' and 'content-type' if applicable) */
  headers: Record<string, string>;
  /** Request body as string (empty string for GET) */
  body: string;
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** AWS region (e.g. 'us-east-1') */
  region: string;
  /** AWS service name (e.g. 'bedrock') */
  service: string;
  /** Optional: override the signing date (ISO 8601 date-time string, for testing) */
  dateOverride?: string;
};

export type SigV4SignedHeaders = {
  /** The Authorization header value */
  Authorization: string;
  /** The x-amz-date header value */
  'x-amz-date': string;
  /** SHA-256 hash of the request body; must be sent as a header so AWS can verify it */
  'x-amz-content-sha256': string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encodes bytes to lowercase hex string */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Encodes a string to UTF-8 bytes */
function encode(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

/** SHA-256 hash of a string, returned as lowercase hex */
async function sha256Hex(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', encode(data));
  return toHex(buffer);
}

/** HMAC-SHA256 of data using key, returned as ArrayBuffer */
async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encode(data));
}

/** Derives the SigV4 signing key */
async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

/** URI-encodes a path component, preserving forward slashes */
function uriEncodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

// ---------------------------------------------------------------------------
// Main signing function
// ---------------------------------------------------------------------------

/**
 * Signs an AWS HTTP request using SigV4 and returns the required signed headers.
 *
 * The caller must merge the returned headers into their request headers before sending.
 *
 * @example
 * ```ts
 * const signed = await signRequest({
 *   method: 'POST',
 *   url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-haiku-20241022-v1:0/converse',
 *   headers: { 'content-type': 'application/json' },
 *   body: JSON.stringify({ messages: [...] }),
 *   accessKeyId: 'AKID...',
 *   secretAccessKey: 'secret...',
 *   region: 'us-east-1',
 *   service: 'bedrock',
 * });
 * // Use signed.Authorization and signed['x-amz-date'] in your request
 * ```
 */
export async function signRequest(opts: SigV4Options): Promise<SigV4SignedHeaders> {
  const { method, url, body, accessKeyId, secretAccessKey, region, service } = opts;

  // Parse URL
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const canonicalUri = uriEncodePath(parsedUrl.pathname) || '/';

  // Sort query params for canonical query string
  const queryParams = [...parsedUrl.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  // Determine the signing date/time
  const now = opts.dateOverride ? new Date(opts.dateOverride) : new Date();
  const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = dateTime.slice(0, 8); // YYYYMMDD

  // Build the headers map, ensuring required headers are present
  const allHeaders: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(opts.headers).map(([k, v]) => [k.toLowerCase(), v]),
    ),
    host,
    'x-amz-date': dateTime,
  };

  // Hash of payload
  const payloadHash = await sha256Hex(body);
  allHeaders['x-amz-content-sha256'] = payloadHash;

  // Canonical headers: sorted by lowercase key, each ending with newline
  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${allHeaders[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  // Canonical request
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    queryParams,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // Credential scope
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // String to sign
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    algorithm,
    dateTime,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // Derive signing key and compute signature
  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = toHex(signatureBuffer);

  // Build Authorization header
  const authorization =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    'x-amz-date': dateTime,
    'x-amz-content-sha256': payloadHash,
  };
}
