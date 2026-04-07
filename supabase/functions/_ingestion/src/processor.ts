/**
 * Content processing logic for immediate mode.
 *
 * Handles the full processing pipeline: fetch, LLM, and database writes.
 */
import { Logger } from '@brainheal/logging'
import type { AddPostCardProps, AddPostProps, BillingRepository, ContentRepository } from '@brainheal/storage'

import { fetchArticle } from './fetcher.ts'
import type { LLMCardItem, LLMCardOutput, LLMProvider } from './llm/provider.ts'

export class Processor {
  private readonly logger = Logger.create('Ingestion Processor')

  constructor(
    private readonly llm: LLMProvider,
    private readonly contentRepository: ContentRepository,
    private readonly billingRepository: BillingRepository,
  ) {
  }

  public async processItem(
    userId: string,
    queueItemId: string,
    inputType: 'url' | 'text',
    inputValue: string,
  ): Promise<void> {
    const logger = this.logger.withProps({ queueItemId, userId })

    // 1. Fetch or research content
    let articleContent: string
    let articleTitle: string
    let articleImages: string[] = []

    if (inputType === 'url') {
      logger.withProps({ inputType, inputValue }).debug('Fetching article')
      const fetched = await fetchArticle(inputValue)
      articleContent = fetched.text
      articleTitle = fetched.title
      articleImages = fetched.images
    } else {
      logger.withProps({ inputType, inputValue }).debug('Researching topic')
      articleContent = await this.llm.researchTopic(inputValue)
      articleTitle = inputValue
    }

    // 2. Generate cards via LLM
    logger.debug('Calling LLM to generate cards')
    const llmResult = await this.llm.summarize(articleContent)
    const { output, usage } = llmResult

    logger
      .withProps({
        cardsCount: output.cards.length,
        tokensInput: usage.tokens_input,
        tokensOutput: usage.tokens_output,
        costUsd: usage.cost_usd,
      })
      .debug('Calling LLM to generate cards')

    // 3. Create the post and cards in the database
    const postProps: AddPostProps = {
      title: output.title || articleTitle || 'Untitled',
      source: {
        type: inputType,
        value: inputValue,
      },
    }

    const cards = this.buildCards(output, articleImages)
    await this.contentRepository.addPost(userId, queueItemId, postProps, cards)

    // 6. Record LLM costs
    try {
      await this.billingRepository.recordUsage(userId, queueItemId, usage)
    } catch (error) {
      logger
        .withException(error)
        .withProps({ userId, queueItemId })
        .warning('Failed to record cost')
    }
  }

  private buildCards(
    output: LLMCardOutput,
    images: string[],
  ): AddPostCardProps[] {
    const rows: AddPostCardProps[] = []
    let position = 1

    for (const card of output.cards) {
      const row = this.buildCardRow(card, position)
      if (row) {
        rows.push(row)
        position++
      }
    }

    // Append images from the article as image cards
    for (const imageUrl of images) {
      if (position > 7) break
      rows.push({
        position,
        contentType: 'image',
        textContent: null,
        mediaUrl: imageUrl,
        mediaCaption: null,
      })
      position++
    }

    return rows
  }

  private buildCardRow(
    card: LLMCardItem,
    position: number,
  ): AddPostCardProps | null {
    if (card.type === 'text') {
      return {
        position,
        contentType: 'text',
        textContent: card.content,
        mediaUrl: null,
        mediaCaption: null,
      }
    }

    if (card.type === 'key_points') {
      const text = card.items.map((item) => `- ${item}`).join('\n')
      return {
        position,
        contentType: 'key_points',
        textContent: text,
        mediaUrl: null,
        mediaCaption: null,
      }
    }

    if (card.type === 'quote') {
      const text = card.attribution ? `> ${card.content}\n\n— ${card.attribution}` : `> ${card.content}`
      return {
        position,
        contentType: 'quote',
        textContent: text,
        mediaUrl: null,
        mediaCaption: null,
      }
    }

    if (card.type === 'image') {
      return {
        position,
        contentType: 'image',
        textContent: null,
        mediaUrl: card.url,
        mediaCaption: card.caption ?? null,
      }
    }

    return null
  }
}
