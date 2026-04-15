import { useEffect, useRef } from 'react'
import styles from './LinkContextMenu.module.css'
import type { ReadNextStatus } from '../hooks/useReadNext.ts'

type LinkContextMenuProps = {
  url: string
  position: { x: number; y: number }
  onReadNext: () => void
  onOpenBrowser: () => void
  onDismiss: () => void
  status: ReadNextStatus
}

function useIsMobile(): boolean {
  return typeof globalThis !== 'undefined' && 'matchMedia' in globalThis &&
    (globalThis as Window).matchMedia('(max-width: 768px)').matches
}

/**
 * Context menu shown when a user taps/clicks a link in a card.
 * On mobile: renders as a bottom sheet.
 * On desktop: renders as a positioned popover.
 */
export function LinkContextMenu({ url: _url, position, onReadNext, onOpenBrowser, onDismiss, status }: LinkContextMenuProps) {
  const isMobile = useIsMobile()
  const isLoading = status === 'loading'
  const isSuccess = status === 'success'

  const popoverRef = useRef<HTMLDivElement>(null)

  // Adjust popover position to stay within viewport on desktop
  const adjustedPosition = { x: position.x, y: position.y }
  if (!isMobile && typeof globalThis !== 'undefined' && 'innerWidth' in globalThis) {
    const g = globalThis as Window
    const popoverWidth = 180
    const popoverHeight = 100
    if (adjustedPosition.x + popoverWidth > g.innerWidth - 8) {
      adjustedPosition.x = g.innerWidth - popoverWidth - 8
    }
    if (adjustedPosition.y + popoverHeight > g.innerHeight - 8) {
      adjustedPosition.y = position.y - popoverHeight - 8
    }
  }

  useEffect(() => {
    if (!isMobile) {
      // Focus the popover for keyboard accessibility
      popoverRef.current?.focus()
    }
  }, [isMobile])

  const readNextLabel = isSuccess ? '✓ Added to feed' : isLoading ? 'Adding...' : '📖 Read next'

  if (isMobile) {
    return (
      <>
        <div
          className={styles.bottomSheetBackdrop}
          onClick={onDismiss}
          aria-hidden="true"
        />
        <div
          className={styles.bottomSheet}
          role="dialog"
          aria-label="Link options"
        >
          <div className={styles.bottomSheetHandle} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.bottomSheetItem} ${isLoading ? styles.loadingItem : ''}`}
            onClick={() => { if (!isLoading) onReadNext() }}
            disabled={isLoading}
          >
            <span className={styles.bottomSheetItemIcon} aria-hidden="true">📖</span>
            {readNextLabel}
          </button>
          <button
            type="button"
            className={styles.bottomSheetItem}
            onClick={onOpenBrowser}
          >
            <span className={styles.bottomSheetItemIcon} aria-hidden="true">🌐</span>
            Open in browser
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div
        className={styles.overlay}
        onClick={onDismiss}
        aria-hidden="true"
      />
      <div
        ref={popoverRef}
        className={styles.popover}
        role="menu"
        aria-label="Link options"
        tabIndex={-1}
        style={{
          top: adjustedPosition.y,
          left: adjustedPosition.x,
        }}
      >
        <button
          type="button"
          role="menuitem"
          className={`${styles.popoverItem} ${isLoading ? styles.loadingItem : ''}`}
          onClick={() => { if (!isLoading) onReadNext() }}
          disabled={isLoading}
        >
          <span className={styles.icon} aria-hidden="true">📖</span>
          {readNextLabel}
        </button>
        <button
          type="button"
          role="menuitem"
          className={styles.popoverItem}
          onClick={onOpenBrowser}
        >
          <span className={styles.icon} aria-hidden="true">🌐</span>
          Open in browser
        </button>
      </div>
    </>
  )
}
