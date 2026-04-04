/**
 * worker/src/fetcher_test.ts — Tests for article fetching and content extraction.
 */

import { assertEquals, assertThrows } from '@std/assert';
import { isValidUrl, extractArticleFromHtml } from '@brainheal/shared';

Deno.test('isValidUrl returns true for http URL', () => {
  assertEquals(isValidUrl('http://example.com'), true);
});

Deno.test('isValidUrl returns true for https URL', () => {
  assertEquals(isValidUrl('https://example.com/article/123'), true);
});

Deno.test('isValidUrl returns false for relative path', () => {
  assertEquals(isValidUrl('/some/path'), false);
});

Deno.test('isValidUrl returns false for ftp URL', () => {
  assertEquals(isValidUrl('ftp://example.com'), false);
});

Deno.test('isValidUrl returns false for plain text', () => {
  assertEquals(isValidUrl('just some text'), false);
});

Deno.test('isValidUrl returns false for empty string', () => {
  assertEquals(isValidUrl(''), false);
});

Deno.test('extractArticleFromHtml extracts article from valid HTML', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Test Article</title></head>
      <body>
        <article>
          <h1>Test Article Title</h1>
          <p>This is a sample article with enough content to be extracted.
             It has multiple sentences and paragraphs to ensure Readability
             can parse it correctly. The article discusses various topics and
             provides meaningful information for the reader. It should be
             long enough to pass the minimum content threshold.</p>
          <p>This second paragraph adds more context to the article.
             Readability needs sufficient text to determine that this is
             a real article worth extracting. More text means better results.</p>
        </article>
      </body>
    </html>
  `;

  const result = extractArticleFromHtml(html, 'https://example.com/test');
  assertEquals(typeof result.text, 'string');
  assertEquals(result.text.length > 50, true);
  assertEquals(typeof result.title, 'string');
  assertEquals(Array.isArray(result.images), true);
});

Deno.test('extractArticleFromHtml extracts images from article', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <article>
          <h1>Article with Images</h1>
          <p>Article content with enough text to pass the minimum threshold.
             More content here to ensure Readability extracts it properly.
             We need at least 50 characters of text content.</p>
          <img src="https://example.com/image1.jpg" alt="Image 1" />
          <p>More article text follows the image above. This helps pad out
             the word count so that Readability considers it a valid article.</p>
          <img src="/relative/image2.jpg" alt="Image 2" />
        </article>
      </body>
    </html>
  `;

  const result = extractArticleFromHtml(html, 'https://example.com/article');
  assertEquals(Array.isArray(result.images), true);
  // At least one image should be extracted (absolute URL)
  const hasAbsoluteImage = result.images.some((url) =>
    url.startsWith('https://example.com')
  );
  assertEquals(hasAbsoluteImage, true);
});

Deno.test('extractArticleFromHtml throws on insufficient content', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body><p>Hi</p></body>
    </html>
  `;

  assertThrows(
    () => extractArticleFromHtml(html, 'https://example.com'),
    Error,
  );
});
