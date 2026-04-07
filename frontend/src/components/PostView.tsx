import { useState, useCallback, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { FeedItem, Card } from '@brainheal/storage'
import { supabase } from '@/lib/supabase'
import { CardView } from './CardView.tsx'
import { SaveButton } from './SaveButton.tsx'
import styles from './PostView.module.css'

type PostViewProps = {
  feedItem: FeedItem
  onRead: (feedItemId: string) => void
  onSnooze: (feedItemId: string) => void
}

const SWIPE_THRESHOLD = 80
const ACTION_THRESHOLD = 120

/**
 * Renders a single post as a horizontally swipeable card carousel.
 *
 * Gestures:
 * - Swipe LEFT on the last card → mark as read (remove from feed)
 * - Swipe RIGHT on the first card → snooze (move to bottom of feed)
 * - Swipe LEFT/RIGHT between cards → navigate cards with visual sliding
 */
export function PostView({ feedItem, onRead, onSnooze }: PostViewProps) {
  const post = feedItem.post
  const [currentCard, setCurrentCard] = useState<number>(0)
  const [swipeOffset, setSwipeOffset] = useState<number>(0)
  const [isAnimating, setIsAnimating] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isAnimatingRef = useRef<boolean>(false)
  const currentCardRef = useRef<number>(0)

  if (!post) return null

  const cards: Card[] = [...(post.cards ?? [])].sort((a, b) => a.position - b.position)
  const totalCards = cards.length

  const isOnFirstCard = currentCard === 0
  const isOnLastCard = currentCard === totalCards - 1
  const canSnooze = isOnFirstCard && swipeOffset > 0
  const canArchive = isOnLastCard && swipeOffset < 0

  currentCardRef.current = currentCard
  isAnimatingRef.current = isAnimating

  const animateToCard = useCallback((targetIndex: number) => {
    console.log('Called animateToCard with targetIndex:', targetIndex)
    isAnimatingRef.current = true
    setIsAnimating(true)
    setSwipeOffset(0)
    currentCardRef.current = targetIndex
    setCurrentCard(targetIndex)
    setTimeout(() => {
      isAnimatingRef.current = false
      setIsAnimating(false)
    }, 300)
  }, [])

  const handleMarkRead = useCallback(() => {
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
  }, [feedItem.id, onRead])

  const handleSnooze = useCallback(() => {
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
  }, [feedItem.id, onSnooze])

  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      console.log('Swiping')
      if (isAnimatingRef.current) return
      setSwipeOffset(e.deltaX)
    },
    onSwipedLeft: (e) => {
      console.log('Swiping left')
      if (isAnimatingRef.current) return
      const delta = Math.abs(e.deltaX)
      const card = currentCardRef.current
      const isLast = card === totalCards - 1

      if (delta > SWIPE_THRESHOLD) {
        if (isLast && delta > ACTION_THRESHOLD) {
          handleMarkRead()
        } else if (card < totalCards - 1) {
          animateToCard(card + 1)
        } else {
          setSwipeOffset(0)
        }
      } else {
        setSwipeOffset(0)
      }
    },
    onSwipedRight: (e) => {
      console.log('Swiping right')
      if (isAnimatingRef.current) return
      const delta = Math.abs(e.deltaX)
      const card = currentCardRef.current
      const isFirst = card === 0

      if (delta > SWIPE_THRESHOLD) {
        if (isFirst && delta > ACTION_THRESHOLD) {
          handleSnooze()
        } else if (card > 0) {
          animateToCard(card - 1)
        } else {
          setSwipeOffset(0)
        }
      } else {
        setSwipeOffset(0)
      }
    },
    onSwiped: (e) => {
      console.log('Swiped')
      if (!isAnimatingRef.current && Math.abs(e.deltaX) <= SWIPE_THRESHOLD) {
        setSwipeOffset(0)
      }
    },
    preventScrollOnSwipe: true,
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

  const snoozeReveal = canSnooze ? Math.min(swipeOffset / ACTION_THRESHOLD, 1) : 0
  const archiveReveal = canArchive ? Math.min(Math.abs(swipeOffset) / ACTION_THRESHOLD, 1) : 0

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
          <div className={styles.dots} role="tablist" aria-label="Card navigation">
            {cards.map((_, i) => (
              <button
                type="button"
                key={i}
                role="tab"
                aria-selected={i === currentCard}
                aria-label={`Card ${i + 1} of ${totalCards}`}
                className={`${styles.dot} ${i === currentCard ? styles.dotActive : ''}`}
                onClick={() => animateToCard(i)}
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
            aria-hidden="true"
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
            aria-hidden="true"
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
              <CardView card={prevCard} postTitle={post.title} isFirstCard={false} />
            </div>
          )}

          {/* Current card */}
          {card && (
            <div className={styles.currentCard}>
              <CardView card={card} postTitle={post.title} isFirstCard={currentCard === 0} />
            </div>
          )}

          {/* Next card (sliding in from right) */}
          {nextCard && swipeOffset < 0 && (
            <div className={styles.adjacentCard} style={{ left: '100%' }}>
              <CardView card={nextCard} postTitle={post.title} isFirstCard={false} />
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
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sourceLink}
                aria-label={`Open source: ${sourceLabel}`}
              >
                {sourceLabel} ↗
              </a>
            )}
          </div>
        </div>
      </footer>
    </article>
  )
}
