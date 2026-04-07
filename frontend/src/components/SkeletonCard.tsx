import type { FeedItem } from '@brainheal/storage';
import styles from './SkeletonCard.module.css';

type SkeletonCardProps = {
  feedItem?: FeedItem;
};

/**
 * Shown when a feed_item has post_id=null (content still processing).
 * Shows a pulsing skeleton with queue status indicator.
 */
export function SkeletonCard({ feedItem }: SkeletonCardProps) {
  const queueItem = feedItem?.queue_item;
  const status = queueItem?.status ?? 'pending';
  const inputValue = queueItem?.input_value ?? '';
  const truncated = inputValue.length > 60 ? `${inputValue.slice(0, 57)}…` : inputValue;
  const isFailed = status === 'failed';

  return (
    <div
      className={`${styles.skeleton} ${isFailed ? styles.skeletonFailed : ''}`}
      role="status"
      aria-label={`Processing: ${truncated || 'content'}`}
    >
      {/* Shimmer lines */}
      {!isFailed && (
        <>
          <div className={`${styles.shimmerLine} ${styles.shimmerLong}`} />
          <div className={`${styles.shimmerLine} ${styles.shimmerMedium}`} />
        </>
      )}

      {/* Status indicator */}
      <div className={styles.statusRow}>
        {!isFailed && (
          <div className={styles.spinner} aria-hidden="true" />
        )}
        {isFailed && (
          <span className={styles.failedIcon} aria-hidden="true">⚠</span>
        )}
        <div className={styles.statusText}>
          {isFailed ? (
            <>
              <span className={styles.statusLabel}>Processing failed</span>
              {queueItem?.error_message && (
                <span className={styles.statusSub}>{queueItem.error_message}</span>
              )}
            </>
          ) : (
            <>
              <span className={styles.statusLabel}>
                {status === 'processing' ? 'Processing…' : 'In queue'}
              </span>
              {truncated && (
                <span className={styles.statusSub}>{truncated}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
