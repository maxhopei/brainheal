/**
 * Tests for LLM prompt generation — including read-next context prompts.
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import {
  buildReadNextResearchPrompt,
  buildReadNextSystemPrompt,
  RESEARCH_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from './prompts.ts'
import type { ParentContext } from './provider.ts'

// ---------------------------------------------------------------------------
// Tests: SYSTEM_PROMPT
// ---------------------------------------------------------------------------

Deno.test('SYSTEM_PROMPT - contains card format instructions', () => {
  assertStringIncludes(SYSTEM_PROMPT, 'BrainHeal')
  assertStringIncludes(SYSTEM_PROMPT, '"title"')
  assertStringIncludes(SYSTEM_PROMPT, '"cards"')
  assertStringIncludes(SYSTEM_PROMPT, 'JSON')
})

Deno.test('SYSTEM_PROMPT - instructs to produce 3-7 cards', () => {
  assertStringIncludes(SYSTEM_PROMPT, '3–7 cards')
})

// ---------------------------------------------------------------------------
// Tests: RESEARCH_SYSTEM_PROMPT
// ---------------------------------------------------------------------------

Deno.test('RESEARCH_SYSTEM_PROMPT - contains research instructions', () => {
  assertStringIncludes(RESEARCH_SYSTEM_PROMPT, 'research assistant')
  assertStringIncludes(RESEARCH_SYSTEM_PROMPT, '400–800 words')
})

// ---------------------------------------------------------------------------
// Tests: buildReadNextSystemPrompt
// ---------------------------------------------------------------------------

const sampleParentContext: ParentContext = {
  postTitle: 'Introduction to Quantum Computing',
  cardTexts: [
    'Quantum computers use qubits instead of classical bits.',
    'Superposition allows qubits to exist in multiple states simultaneously.',
  ],
  selectedValue: 'superposition',
}

Deno.test('buildReadNextSystemPrompt - includes parent post title', () => {
  const prompt = buildReadNextSystemPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'Introduction to Quantum Computing')
})

Deno.test('buildReadNextSystemPrompt - includes parent card content', () => {
  const prompt = buildReadNextSystemPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'Quantum computers use qubits')
  assertStringIncludes(prompt, 'Superposition allows qubits')
})

Deno.test('buildReadNextSystemPrompt - includes selected value', () => {
  const prompt = buildReadNextSystemPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'superposition')
})

Deno.test('buildReadNextSystemPrompt - instructs to assume user knows basics', () => {
  const prompt = buildReadNextSystemPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'already understand the basics')
})

Deno.test('buildReadNextSystemPrompt - still contains JSON format instructions', () => {
  const prompt = buildReadNextSystemPrompt(sampleParentContext)
  assertStringIncludes(prompt, '"title"')
  assertStringIncludes(prompt, '"cards"')
  assertStringIncludes(prompt, 'JSON')
})

Deno.test('buildReadNextSystemPrompt - handles empty card texts', () => {
  const ctx: ParentContext = {
    postTitle: 'Test Post',
    cardTexts: [],
    selectedValue: 'something',
  }
  const prompt = buildReadNextSystemPrompt(ctx)
  assertStringIncludes(prompt, 'Test Post')
  assertStringIncludes(prompt, 'something')
})

// ---------------------------------------------------------------------------
// Tests: buildReadNextResearchPrompt
// ---------------------------------------------------------------------------

Deno.test('buildReadNextResearchPrompt - includes parent post context', () => {
  const prompt = buildReadNextResearchPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'Introduction to Quantum Computing')
  assertStringIncludes(prompt, 'Quantum computers use qubits')
})

Deno.test('buildReadNextResearchPrompt - includes selected term', () => {
  const prompt = buildReadNextResearchPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'superposition')
})

Deno.test('buildReadNextResearchPrompt - instructs research in context', () => {
  const prompt = buildReadNextResearchPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'context')
})

Deno.test('buildReadNextResearchPrompt - instructs prose not bullets', () => {
  const prompt = buildReadNextResearchPrompt(sampleParentContext)
  assertStringIncludes(prompt, 'Do not use bullet lists')
})

// ---------------------------------------------------------------------------
// Tests: standard vs read-next prompt are distinct
// ---------------------------------------------------------------------------

Deno.test('buildReadNextSystemPrompt differs from standard SYSTEM_PROMPT', () => {
  const readNextPrompt = buildReadNextSystemPrompt(sampleParentContext)
  assertEquals(readNextPrompt !== SYSTEM_PROMPT, true)
})

Deno.test('buildReadNextResearchPrompt differs from standard RESEARCH_SYSTEM_PROMPT', () => {
  const readNextPrompt = buildReadNextResearchPrompt(sampleParentContext)
  assertEquals(readNextPrompt !== RESEARCH_SYSTEM_PROMPT, true)
})
