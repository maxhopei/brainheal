import { Logger } from '@brainheal/logging'
import type { IngestionQueue } from '@brainheal/storage'
import type { Accountant } from './accountant.ts'
import type { Processor } from './processor.ts'

export type QueueConsumerOptions = {
  maxRetries: number
}

export class QueueConsumer {
  private readonly logger = Logger.create('QueueConsumer')

  constructor(
    private readonly queue: IngestionQueue,
    private readonly accountant: Accountant,
    private readonly processor: Processor,
    private readonly options: QueueConsumerOptions,
  ) {
  }

  public async processNextItem(): Promise<boolean> {
    // 1. Claim the next pending item using a Postgres RPC to ensure atomicity
    const claimedItem = await this.queue.claimNextPendingItem()

    if (!claimedItem) {
      return false
    }

    const { id: queueItemId, userId, inputType, inputValue, retryCount } = claimedItem

    const logger = this.logger.withProps({ queueItemId, userId })

    logger.withProps({ inputType, inputValue }).debug('Processing queue item')

    // 2. Check daily budget
    let budgetCheck
    try {
      budgetCheck = await this.accountant.checkDailyBudget(userId)
    } catch (err) {
      logger.withException(err).error('Budget check failed. Re-queuing item for retry without changes.')
      // Revert to pending so it can be retried
      await this.queue.markItemPending(queueItemId)
      return false
    }

    if (!budgetCheck.allowed) {
      logger.withProps(budgetCheck).debug('Daily budget exceeded — deferring item')
      // Revert to pending so it will be picked up tomorrow
      // todo: this will not wait until tomorrow. Fix.
      await this.queue.markItemPending(queueItemId)
      return false
    }

    // 3. Process the item
    try {
      await this.processor.processItem(userId, queueItemId, inputType, inputValue)

      // 4. Mark completed
      await this.queue.markItemCompleted(queueItemId)

      logger.debug('Queue item completed')
      return true
    } catch (err) {
      logger.withException(err).debug('Processing failed')
      const errorMessage = err instanceof Error ? err.message : String(err)

      const newRetryCount = retryCount + 1

      if (newRetryCount < this.options.maxRetries) {
        // Re-queue for retry
        await this.queue.requeueItem(queueItemId, newRetryCount, errorMessage)
        logger
          .withProps({
            attempt: newRetryCount + 1,
            maxRetries: this.options.maxRetries,
          })
          .warning(`Retrying item (attempt ${newRetryCount + 1}/${this.options.maxRetries})`)
      } else {
        // Mark as failed
        await this.queue.markItemFailed(queueItemId, errorMessage)

        logger
          .withProps({
            attempt: newRetryCount + 1,
            maxRetries: this.options.maxRetries,
          })
          .error('Item permanently failed after max retries')
      }

      return false
    }
  }
}
