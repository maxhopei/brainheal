import { useCallback, useEffect, useRef, useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { Card, FeedItem } from '@brainheal/storage'
import { supabase } from '@/lib/supabase'
import { CardView } from './CardView.tsx'
import { ReadNextButton } from './ReadNextButton.tsx'
import { SaveButton } from './SaveButton.tsx'
import { useReadNext } from '../hooks/useReadNext.ts'
import styles from './PostView.module.css'

type PostViewProps = {
  feedItem: FeedItem
  onRead: (feedItemId: string) => void
  onSnooze: (feedItemId: string) => void
  onItemQueued?: (feedItemId: string) => Promise<void>
}

const SNAP_THRESHOLD = 0.5
const ACTION_THRESHOLD = 0.4
// Horizontal velocity (px/ms) that classifies a short, quick movement as a flick swipe.
// A deliberate slow drag is typically < 0.2 px/ms; a fast flick is >= 0.3 px/ms.
const FLICK_VELOCITY_THRESHOLD = 0.3
const MIN_SELECTION_LENGTH = 2

type SelectionState = {
  text: string
  position: { top: number; left: number }
  cardId: string
}

/**
 * Renders a single post as a horizontally swipeable card carousel.
 *
 * Gestures:
 * - Swipe LEFT on the last card → mark as read (remove from feed)
 * - Swipe RIGHT on the first card → snooze (move to bottom of feed)
 * - Swipe LEFT/RIGHT between cards → navigate cards with visual sliding
 *
 * Text selection:
 * - Select text in a card → "Read next" button appears above selection
 * - Tap "Read next" → selected text queued as new feed item after this post
 */
export function PostView({ feedItem, onRead, onSnooze, onItemQueued }: PostViewProps) {
  const post = feedItem.post
  const [currentCard, setCurrentCard] = useState<number>(0)
  const [swipeOffset, setSwipeOffset] = useState<number>(0)
  const [isAnimating, setIsAnimating] = useState<boolean>(false)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isAnimatingRef = useRef<boolean>(false)
  const currentCardRef = useRef<number>(0)
  // Locked on the first movement of each gesture: true = horizontal, false = vertical.
  // null means no gesture in progress.
  const isHorizontalSwipeRef = useRef<boolean | null>(null)

  const { queueReadNext, status: readNextStatus } = useReadNext()

  if (!post) return null

  const cards: Card[] = [...(post.cards ?? [])].sort((a, b) => a.position - b.position)
  const totalCards = cards.length

  const isOnFirstCard = currentCard === 0
  const isOnLastCard = currentCard === totalCards - 1
  const canSnooze = isOnFirstCard && swipeOffset > 0
  const canArchive = isOnLastCard && swipeOffset < 0

  currentCardRef.current = currentCard
  isAnimatingRef.current = isAnimating

  // ---- Text selection ----
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = (globalThis as Window).getSelection()
      if (!sel || sel.isCollapsed) {
        setSelection(null)
        return
      }

      const selectedText = sel.toString().trim()
      if (selectedText.length < MIN_SELECTION_LENGTH) {
        setSelection(null)
        return
      }

      // Ensure selection is within this post's container
      if (!containerRef.current) return
      const anchorNode = sel.anchorNode
      if (!anchorNode || !containerRef.current.contains(anchorNode)) {
        setSelection(null)
        return
      }

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      // Determine which card the selection started in
      const currentCardEl = containerRef.current.querySelector('[data-card-index]')
      let cardId = cards[currentCardRef.current]?.id ?? ''

      // Find the card element that contains the anchor node
      const cardElements = containerRef.current.querySelectorAll('[data-card-id]')
      for (const el of cardElements) {
        if (el.contains(anchorNode)) {
          cardId = el.getAttribute('data-card-id') ?? cardId
          break
        }
      }

      // Suppress "unused variable" – cardElements queried above just to find cardId
      void currentCardEl

      setSelection({
        text: selectedText,
        position: {
          top: rect.top + (globalThis as Window).scrollY,
          left: rect.left + rect.width / 2 + (globalThis as Window).scrollX,
        },
        cardId,
      })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [cards])

  const handleReadNextSelection = async () => {
    if (!selection || !post) return

    const feedItemId = await queueReadNext(selection.text, 'text', post.id, selection.cardId)
    ;(globalThis as Window).getSelection()?.removeAllRanges()
    setSelection(null)
    if (feedItemId) await onItemQueued?.(feedItemId)
  }

  // Dismiss selection on swipe start
  const clearSelection = useCallback(() => {
    ;(globalThis as Window).getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  // ---- Card animation ----
  const animateToCard = useCallback((targetIndex: number, direction: 'left' | 'right') => {
    const containerWidth = containerRef.current?.offsetWidth ?? 300
    isAnimatingRef.current = true
    setIsAnimating(true)

    const targetOffset = direction === 'left' ? -containerWidth : containerWidth
    setSwipeOffset(targetOffset)

    setTimeout(() => {
      setIsAnimating(false)
      currentCardRef.current = targetIndex
      setCurrentCard(targetIndex)
      setSwipeOffset(0)
      isAnimatingRef.current = false
    }, 300)
  }, [])

  const snapBack = useCallback(() => {
    isAnimatingRef.current = true
    setIsAnimating(true)
    setSwipeOffset(0)
    setTimeout(() => {
      isAnimatingRef.current = false
      setIsAnimating(false)
    }, 300)
  }, [])

  const handleMarkRead = useCallback(() => {
    clearSelection()
    isAnimatingRef.current = true
    setIsAnimating(true)
    const containerWidth = containerRef.current?.offsetWidth ?? 300
    setSwipeOffset(-containerWidth)

    setTimeout(() => {
      supabase
        .rpc('mark_feed_item_read', { item_id: feedItem.id })
        .then(({ error }) => {
          if (!error) {
            onRead(feedItem.id)
          }
          setSwipeOffset(0)
          isAnimatingRef.current = false
          setIsAnimating(false)
        })
    }, 300)
  }, [feedItem.id, onRead, clearSelection])

  const handleSnooze = useCallback(() => {
    clearSelection()
    isAnimatingRef.current = true
    setIsAnimating(true)
    const containerWidth = containerRef.current?.offsetWidth ?? 300
    setSwipeOffset(containerWidth)

    setTimeout(() => {
      supabase
        .rpc('snooze_feed_item', { item_id: feedItem.id })
        .then(({ error }) => {
          if (!error) {
            onSnooze(feedItem.id)
          }
          setSwipeOffset(0)
          isAnimatingRef.current = false
          setIsAnimating(false)
        })
    }, 300)
  }, [feedItem.id, onSnooze, clearSelection])

  const swipeHandlers = useSwipeable({
    onSwipeStart: (_e) => {
      // Don't classify the axis here — absX/absY are both 0 at touchstart.
      // Defer to onSwiping where actual movement data is available.
      isHorizontalSwipeRef.current = null
    },
    onSwiping: (e) => {
      if (isAnimatingRef.current) return
      // If text is already selected the user is likely adjusting a selection handle — don't swipe.
      if ((globalThis as Window).getSelection()?.isCollapsed === false) {
        isHorizontalSwipeRef.current = false
        return
      }
      // Classify axis on the first meaningful movement.
      if (isHorizontalSwipeRef.current === null) {
        isHorizontalSwipeRef.current = e.absX >= e.absY
      }
      if (!isHorizontalSwipeRef.current) return
      // Clear text selection when swiping horizontally
      clearSelection()
      // Prevent the browser from scrolling while we own this horizontal gesture.
      if (e.event.cancelable) e.event.preventDefault()
      setSwipeOffset(e.deltaX)
    },
    onSwiped: (e) => {
      const wasHorizontal = isHorizontalSwipeRef.current
      isHorizontalSwipeRef.current = null

      if (isAnimatingRef.current) return
      if (!wasHorizontal) return

      const containerWidth = containerRef.current?.offsetWidth ?? 300
      const deltaX = e.deltaX
      const swipeRatio = Math.abs(deltaX) / containerWidth
      // Horizontal velocity in px/ms — used to recognise short, fast flick gestures.
      const isFlick = Math.abs(e.vxvy[0]) >= FLICK_VELOCITY_THRESHOLD
      const swipedLeft = deltaX < 0
      const swipedRight = deltaX > 0

      const card = currentCardRef.current
      const isFirst = card === 0
      const isLast = card === totalCards - 1

      if (isLast && swipedLeft && (swipeRatio > ACTION_THRESHOLD || isFlick)) {
        handleMarkRead()
        return
      }
      if (isFirst && swipedRight && (swipeRatio > ACTION_THRESHOLD || isFlick)) {
        handleSnooze()
        return
      }

      if (swipeRatio > SNAP_THRESHOLD || isFlick) {
        if (swipedLeft && card < totalCards - 1) {
          animateToCard(card + 1, 'left')
          return
        }
        if (swipedRight && card > 0) {
          animateToCard(card - 1, 'right')
          return
        }
      }

      snapBack()
    },
    // Scroll prevention is handled manually in onSwiping (only for horizontal gestures),
    // so we disable the library's blanket preventScrollOnSwipe and opt out of passive
    // listeners so that preventDefault() is actually honoured.
    preventScrollOnSwipe: false,
    touchEventOptions: { passive: false },
    trackTouch: true,
    trackMouse: true,
    delta: 10,
  })

  const card = cards[currentCard]
  const prevCard = currentCard > 0 ? cards[currentCard - 1] : null
  const nextCard = currentCard < totalCards - 1 ? cards[currentCard + 1] : null

  const sourceLabel = post.source_url
    ? (() => {
      try {
        return new URL(post.source_url).hostname.replace(/^www\./, '')
      } catch {
        return post.source_url
      }
    })()
    : null

  const containerWidth = containerRef.current?.offsetWidth ?? 300
  const actionThresholdPx = containerWidth * ACTION_THRESHOLD
  const snoozeReveal = canSnooze ? Math.min(swipeOffset / actionThresholdPx, 1) : 0
  const archiveReveal = canArchive ? Math.min(Math.abs(swipeOffset) / actionThresholdPx, 1) : 0

  return (
    <article className={styles.postView} aria-label={`Post: ${post.title}`}>
      {/* Card carousel */}
      <div
        className={styles.cardCarousel}
        {...swipeHandlers}
        ref={(el) => {
          containerRef.current = el
          swipeHandlers.ref(el as unknown as HTMLElement)
        }}
      >
        {/* Position indicator dots */}
        {totalCards > 1 && (
          <div className={styles.dots} role='tablist' aria-label='Card navigation'>
            {cards.map((_, i) => (
              <button
                type='button'
                key={i}
                role='tab'
                aria-selected={i === currentCard}
                aria-label={`Card ${i + 1} of ${totalCards}`}
                className={`${styles.dot} ${i === currentCard ? styles.dotActive : ''}`}
                onClick={() => animateToCard(i, i > currentCard ? 'left' : 'right')}
              />
            ))}
          </div>
        )}

        {/* Action panels behind cards */}
        {isOnFirstCard && (
          <div
            className={styles.actionPanel}
            style={{
              left: 0,
              opacity: snoozeReveal,
              background: `rgba(34, 197, 94, ${0.15 + snoozeReveal * 0.1})`,
            }}
            aria-hidden='true'
          >
            <span className={styles.actionIcon}>↩</span>
            <span className={styles.actionText}>Snooze</span>
          </div>
        )}
        {isOnLastCard && (
          <div
            className={styles.actionPanel}
            style={{
              right: 0,
              opacity: archiveReveal,
              background: `rgba(59, 130, 246, ${0.15 + archiveReveal * 0.1})`,
            }}
            aria-hidden='true'
          >
            <span className={styles.actionIcon}>✓</span>
            <span className={styles.actionText}>Archive</span>
          </div>
        )}

        {/* Cards container with sliding */}
        <div
          className={`${styles.cardsTrack} ${isAnimating ? styles.animating : ''}`}
          style={{ transform: `translateX(${swipeOffset}px)` }}
        >
          {/* Previous card (sliding in from left) */}
          {prevCard && swipeOffset > 0 && (
            <div className={styles.adjacentCard} style={{ left: '-100%' }}>
              <div className={styles.selectableContent} data-card-id={prevCard.id}>
                <CardView card={prevCard} postTitle={post.title} isFirstCard={false} postId={post.id} onItemQueued={onItemQueued} />
              </div>
            </div>
          )}

          {/* Current card */}
          {card && (
            <div className={styles.currentCard}>
              <div className={styles.selectableContent} data-card-id={card.id}>
                <CardView card={card} postTitle={post.title} isFirstCard={currentCard === 0} postId={post.id} onItemQueued={onItemQueued} />
              </div>
            </div>
          )}

          {/* Next card (sliding in from right) */}
          {nextCard && swipeOffset < 0 && (
            <div className={styles.adjacentCard} style={{ left: '100%' }}>
              <div className={styles.selectableContent} data-card-id={nextCard.id}>
                <CardView card={nextCard} postTitle={post.title} isFirstCard={false} postId={post.id} onItemQueued={onItemQueued} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <SaveButton postId={post.id} />
        </div>
        <div className={styles.footerRight}>
          <div className={styles.postMeta}>
            {currentCard !== 0 && <span className={styles.postTitle}>{post.title}</span>}
            {sourceLabel && (
              <a
                href={post.source_url ?? '#'}
                target='_blank'
                rel='noopener noreferrer'
                className={styles.sourceLink}
                aria-label={`Open source: ${sourceLabel}`}
              >
                {sourceLabel} ↗
              </a>
            )}
          </div>
        </div>
      </footer>

      {/* Floating "Read next" button on text selection */}
      {selection && selection.text.length >= MIN_SELECTION_LENGTH && (
        <ReadNextButton
          selectedText={selection.text}
          position={selection.position}
          status={readNextStatus}
          onReadNext={handleReadNextSelection}
        />
      )}
    </article>
  )
}
