import type { LLMCardItem, LLMCardOutput } from './provider.ts'

// ---------------------------------------------------------------------------
// JSON parsing with validation
// ---------------------------------------------------------------------------

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string')
}

export function parseAndValidateLLMOutput(raw: string): LLMCardOutput {
  const rawTrimmed = raw.trim()
    .replace(/^```json/, '')
    .replace(/```$/, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(rawTrimmed)
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('LLM response is not a JSON object')
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj['title'] !== 'string' || obj['title'].trim() === '') {
    throw new Error('LLM response missing or empty "title" field')
  }

  if (!Array.isArray(obj['cards']) || obj['cards'].length === 0) {
    throw new Error('LLM response missing or empty "cards" array')
  }

  const cards: LLMCardItem[] = []
  for (const card of obj['cards'] as unknown[]) {
    if (typeof card !== 'object' || card === null) {
      throw new Error('Card is not an object')
    }
    const c = card as Record<string, unknown>

    if (c['type'] === 'text') {
      if (typeof c['content'] !== 'string') throw new Error('text card missing content')
      cards.push({ type: 'text', content: c['content'] })
    } else if (c['type'] === 'key_points') {
      if (!isStringArray(c['items'])) throw new Error('key_points card missing items array')
      cards.push({ type: 'key_points', items: c['items'] })
    } else if (c['type'] === 'quote') {
      if (typeof c['content'] !== 'string') throw new Error('quote card missing content')
      const attribution = typeof c['attribution'] === 'string' ? c['attribution'] : undefined
      cards.push({ type: 'quote', content: c['content'], attribution })
    } else if (c['type'] === 'image') {
      if (typeof c['url'] !== 'string') throw new Error('image card missing url')
      const caption = typeof c['caption'] === 'string' ? c['caption'] : undefined
      cards.push({ type: 'image', url: c['url'], caption })
    } else {
      throw new Error(`Unknown card type: ${c['type']}`)
    }
  }

  return { title: (obj['title'] as string).trim(), cards }
}
