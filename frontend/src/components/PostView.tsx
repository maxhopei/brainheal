import { useState, useCallback } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { FeedItem, Card } from '@brainheal/shared';
import { supabase } from '@/lib/supabase';
import { CardView } from './CardView.tsx';
import { SaveButton } from './SaveButton.tsx';
import styles from './PostView.module.css';

type PostViewProps = {
  feedItem: FeedItem;
  onRead: (feedItemId: string) => void;
  onSnooze: (feedItemId: string) => void;
};

/**
 * Renders a single post as a horizontally swipeable card carousel.
 *
 * Gestures:
 * - Swipe LEFT on the last card → mark as read (remove from feed)
 * - Swipe RIGHT on the first card → snooze (move to bottom of feed)
 * - Swipe LEFT/RIGHT between cards → navigate cards
 */
export function PostView({ feedItem, onRead, onSnooze }: PostViewProps) {
  const post = feedItem.post;
  const [currentCard, setCurrentCard] = useState<number>(0);
  const [swiping, setSwiping] = useState<boolean>(false);

  if (!post) return null;

  const cards: Card[] = [...(post.cards ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const totalCards = cards.length;

  const goToCard = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalCards) return;
      setCurrentCard(index);
    },
    [totalCards],
  );

  const handleMarkRead = useCallback(async () => {
    const { error } = await supabase.rpc('mark_feed_item_read', {
      item_id: feedItem.id,
    });
    if (!error) {
      onRead(feedItem.id);
    }
  }, [feedItem.id, onRead]);

  const handleSnooze = useCallback(async () => {
    const { error } = await supabase.rpc('snooze_feed_item', {
      item_id: feedItem.id,
    });
    if (!error) {
      onSnooze(feedItem.id);
    }
  }, [feedItem.id, onSnooze]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (currentCard < totalCards - 1) {
        // Navigate to next card
        goToCard(currentCard + 1);
      } else {
        // On last card — mark as read
        handleMarkRead();
      }
    },
    onSwipedRight: () => {
      if (currentCard > 0) {
        // Navigate to previous card
        goToCard(currentCard - 1);
      } else {
        // On first card — snooze
        handleSnooze();
      }
    },
    onSwiping: () => setSwiping(true),
    onSwiped: () => setSwiping(false),
    preventScrollOnSwipe: true,
    trackTouch: true,
    trackMouse: false,
    delta: 30,
  });

  const card = cards[currentCard];
  const sourceLabel = post.source_url
    ? (() => {
        try {
          return new URL(post.source_url).hostname.replace(/^www\./, '');
        } catch {
          return post.source_url;
        }
      })()
    : null;

  return (
    <article
      className={`${styles.postView} ${swiping ? styles.swiping : ''}`}
      aria-label={`Post: ${post.title}`}
    >
      {/* Card carousel */}
      <div className={styles.cardCarousel} {...swipeHandlers}>
        {/* Position indicator dots */}
        {totalCards > 1 && (
          <div className={styles.dots} role="tablist" aria-label="Card navigation">
            {cards.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === currentCard}
                aria-label={`Card ${i + 1} of ${totalCards}`}
                className={`${styles.dot} ${i === currentCard ? styles.dotActive : ''}`}
                onClick={() => goToCard(i)}
              />
            ))}
          </div>
        )}

        {/* Swipe hint on edges */}
        {currentCard === 0 && totalCards > 0 && (
          <div className={styles.swipeHintLeft} aria-hidden="true">
            <span className={styles.swipeHintIcon}>↩</span>
            <span className={styles.swipeHintText}>Snooze</span>
          </div>
        )}
        {currentCard === totalCards - 1 && (
          <div className={styles.swipeHintRight} aria-hidden="true">
            <span className={styles.swipeHintIcon}>✓</span>
            <span className={styles.swipeHintText}>Read</span>
          </div>
        )}

        {/* Card content */}
        {card && <CardView card={card} />}
      </div>

      {/* Post footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <SaveButton postId={post.id} />
        </div>
        <div className={styles.footerRight}>
          <div className={styles.postMeta}>
            <span className={styles.postTitle}>{post.title}</span>
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
  );
}
