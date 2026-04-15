import styles from './ReadNextButton.module.css'
import type { ReadNextStatus } from '../hooks/useReadNext.ts'

const MAX_SELECTION_LENGTH = 200

type ReadNextButtonProps = {
  selectedText: string
  position: { top: number; left: number }
  status: ReadNextStatus
  onReadNext: () => void
}

/**
 * Floating "Read next" button that appears when the user selects text in a card.
 * Positioned above/near the text selection using getBoundingClientRect coordinates.
 */
export function ReadNextButton({ selectedText, position, status, onReadNext }: ReadNextButtonProps) {
  const isTooLong = selectedText.length > MAX_SELECTION_LENGTH
  const isLoading = status === 'loading'
  const isSuccess = status === 'success'

  const handleClick = () => {
    if (!isTooLong && !isLoading) {
      onReadNext()
    }
  }

  return (
    <div
      className={styles.container}
      style={{
        top: Math.max(8, position.top - 44),
        left: position.left,
      }}
    >
      <button
        type="button"
        className={`${styles.button} ${isTooLong || isLoading ? styles.buttonDisabled : ''} ${isSuccess ? styles.success : ''} ${isLoading ? styles.loading : ''}`}
        onClick={handleClick}
        disabled={isTooLong || isLoading}
        aria-label="Read next: queue selected text as new feed item"
      >
        {isSuccess ? '✓ Added to feed' : isLoading ? 'Adding...' : '📖 Read next'}
      </button>
      {isTooLong && (
        <div className={styles.tooltip} role="tooltip">
          Selection too long — try a shorter phrase
        </div>
      )}
    </div>
  )
}
