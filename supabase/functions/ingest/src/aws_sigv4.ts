/**
 * supabase/functions/ingest/src/aws_sigv4.ts — AWS Signature Version 4 (SigV4) request signing.
 *
 * Copied from worker/src/aws_sigv4.ts for immediate mode processing.
 * Signs HTTP requests using AWS credentials and the SigV4 algorithm.
 * Uses the Web Crypto API (crypto.subtle) available natively in Deno.
 */

export type SigV4Options = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  dateOverride?: string;
};

export type SigV4SignedHeaders = {
  Authorization: string;
  'x-amz-date': string;
  'x-amz-content-sha256': string;
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function encode(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

async function sha256Hex(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', encode(data));
  return toHex(buffer);
}

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

function uriEncodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function signRequest(opts: SigV4Options): Promise<SigV4SignedHeaders> {
  const { method, url, body, accessKeyId, secretAccessKey, region, service } = opts;

  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const canonicalUri = uriEncodePath(parsedUrl.pathname) || '/';

  const queryParams = [...parsedUrl.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const now = opts.dateOverride ? new Date(opts.dateOverride) : new Date();
  const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = dateTime.slice(0, 8);

  const allHeaders: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(opts.headers).map(([k, v]) => [k.toLowerCase(), v]),
    ),
    host,
    'x-amz-date': dateTime,
  };

  const payloadHash = await sha256Hex(body);
  allHeaders['x-amz-content-sha256'] = payloadHash;

  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${allHeaders[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    queryParams,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    algorithm,
    dateTime,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = toHex(signatureBuffer);

  const authorization =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    'x-amz-date': dateTime,
    'x-amz-content-sha256': payloadHash,
  };
}
