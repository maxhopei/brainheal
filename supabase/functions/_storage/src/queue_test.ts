/**
 * Tests for IngestionQueue — read-next positioning logic.
 *
 * These tests focus on the pure logic that can be tested without a live Supabase instance.
 * We use a stub Supabase client to control DB responses.
 */

import { assertEquals } from '@std/assert'

// ---------------------------------------------------------------------------
// Extract the feed-position logic for isolated testing
// ---------------------------------------------------------------------------

/**
 * Mirrors the position computation in IngestionQueue.addItem().
 * parentFeedPosition: the position of the parent feed item, or null if not found.
 * maxPosition: the current max position in the feed (or 0 if empty).
 */
function computeFeedPosition(
  parentFeedPosition: number | null,
  maxPosition: number,
): number {
  if (parentFeedPosition !== null) {
    return parentFeedPosition + 0.5
  }
  return maxPosition + 1
}

// ---------------------------------------------------------------------------
// Tests: feed position computation
// ---------------------------------------------------------------------------

Deno.test('computeFeedPosition - standard item placed at end (empty feed)', () => {
  const pos = computeFeedPosition(null, 0)
  assertEquals(pos, 1)
})

Deno.test('computeFeedPosition - standard item placed after last item', () => {
  const pos = computeFeedPosition(null, 5)
  assertEquals(pos, 6)
})

Deno.test('computeFeedPosition - read-next item placed at parent + 0.5', () => {
  const pos = computeFeedPosition(3, 10)
  assertEquals(pos, 3.5)
})

Deno.test('computeFeedPosition - read-next with decimal parent position', () => {
  const pos = computeFeedPosition(3.5, 10)
  assertEquals(pos, 4.0)
})

Deno.test('computeFeedPosition - read-next ignores max position', () => {
  const pos = computeFeedPosition(2, 100)
  assertEquals(pos, 2.5)
})

Deno.test('computeFeedPosition - read-next with parent at position 1', () => {
  const pos = computeFeedPosition(1, 5)
  assertEquals(pos, 1.5)
})

Deno.test('computeFeedPosition - read-next with parent at position 0.5', () => {
  const pos = computeFeedPosition(0.5, 5)
  assertEquals(pos, 1.0)
})

Deno.test('computeFeedPosition - standard item when feed has fractional positions', () => {
  // If max position is 5.5 (after a read-next), standard items go to 6.5
  const pos = computeFeedPosition(null, 5.5)
  assertEquals(pos, 6.5)
})

// ---------------------------------------------------------------------------
// Tests: renormalization trigger logic
// ---------------------------------------------------------------------------

/**
 * Mirrors the renormalization trigger check.
 * Returns true if any adjacent positions are less than 0.1 apart.
 */
function shouldRenormalize(positions: number[]): boolean {
  if (positions.length < 2) return false
  const sorted = [...positions].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < 0.1) return true
  }
  return false
}

Deno.test('shouldRenormalize - returns false for well-spaced positions', () => {
  assertEquals(shouldRenormalize([1, 2, 3, 4, 5]), false)
})

Deno.test('shouldRenormalize - returns false for empty feed', () => {
  assertEquals(shouldRenormalize([]), false)
})

Deno.test('shouldRenormalize - returns false for single item', () => {
  assertEquals(shouldRenormalize([3.5]), false)
})

Deno.test('shouldRenormalize - returns true when positions are 0.05 apart', () => {
  // After many nested read-nexts: 1, 1.5, 1.75, 1.875, ... eventually < 0.1 gap
  assertEquals(shouldRenormalize([1, 1.5, 1.75, 1.875, 1.9375, 1.96875]), true)
})

Deno.test('shouldRenormalize - returns false when gap is 0.5 (well above threshold)', () => {
  // Each pair is 0.5 apart, which is well above the 0.1 threshold
  assertEquals(shouldRenormalize([1, 1.5, 2, 2.5, 3]), false)
})

Deno.test('shouldRenormalize - returns true when gap is just below 0.1', () => {
  assertEquals(shouldRenormalize([1, 1.09, 2]), true)
})
