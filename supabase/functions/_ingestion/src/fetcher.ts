/**
 * worker/src/fetcher.ts — Article fetching and content extraction.
 *
 * Fetches web articles and extracts readable content using Readability + linkedom.
 * For free-text topics, delegates to the LLM research step.
 */

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

export type FetchedArticle = {
  text: string;
  title: string;
  images: string[];
  byline: string | null;
};

const DEFAULT_TIMEOUT_MS = 15_000;

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; BrainHealBot/1.0; +https://brainheal.app/bot)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
};

// Maximum article text length to send to the LLM (to avoid token limits)
const MAX_ARTICLE_CHARS = 32_000;

/**
 * Fetches an article from a URL, extracts readable content, and returns
 * the text, title, and image URLs.
 *
 * Throws on unreachable URLs, HTTP errors (4xx/5xx), and parsing failures.
 */
export async function fetchArticle(url: string): Promise<FetchedArticle> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Fetch timeout after ${DEFAULT_TIMEOUT_MS}ms: ${url}`);
    }
    throw new Error(`Fetch failed for ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new Error(`Article not found (404): ${url}`);
  }
  if (response.status === 403 || response.status === 401) {
    throw new Error(`Access denied — possible paywall (${response.status}): ${url}`);
  }
  if (response.status === 429) {
    throw new Error(`Rate limited (429): ${url}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error(`Unsupported content type "${contentType}" for ${url}`);
  }

  const html = await response.text();
  return extractArticleFromHtml(html, url);
}

/**
 * Extracts readable article content from raw HTML using Readability.
 */
export function extractArticleFromHtml(html: string, url: string): FetchedArticle {
  // deno-lint-ignore no-explicit-any
  const parsed = parseHTML(html) as any;
  const document = parsed.document;

  // Clone document for Readability (it mutates the DOM)
  // deno-lint-ignore no-explicit-any
  const reader = new Readability(document as any);
  const article = reader.parse();

  if (!article || !article.textContent || article.textContent.trim().length < 50) {
    throw new Error(
      `Could not extract readable content from ${url}. Possible paywall or minimal content.`,
    );
  }

  // Extract image URLs from the article HTML
  const images = extractImageUrls(article.content ?? '', url);

  // Truncate text if too long
  let text = article.textContent.trim();
  if (text.length > MAX_ARTICLE_CHARS) {
    text = text.slice(0, MAX_ARTICLE_CHARS) +
      '\n\n[Content truncated at 32,000 characters. This is a long article.]';
  }

  return {
    text,
    title: article.title?.trim() ?? '',
    images,
    byline: article.byline?.trim() ?? null,
  };
}

/**
 * Extracts image URLs from article HTML content.
 * Returns absolute URLs only.
 */
function extractImageUrls(html: string, baseUrl: string): string[] {
  // deno-lint-ignore no-explicit-any
  const parsed = parseHTML(`<div>${html}</div>`) as any;
  const document = parsed.document;
  const imgElements = document.querySelectorAll('img[src]');

  const urls: string[] = [];
  for (const img of imgElements) {
    const src = img.getAttribute('src');
    if (!src) continue;

    try {
      const absoluteUrl = new URL(src, baseUrl).href;
      // Filter out tracking pixels, tiny images, data URIs
      if (
        absoluteUrl.startsWith('http') &&
        !absoluteUrl.includes('tracking') &&
        !src.startsWith('data:')
      ) {
        urls.push(absoluteUrl);
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  // Deduplicate and limit to 5 images
  return [...new Set(urls)].slice(0, 5);
}

/**
 * Validates that a string is a valid http/https URL.
 */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
