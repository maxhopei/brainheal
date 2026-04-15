import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks/useFeed';
import { PostView } from '@/components/PostView';
import { SkeletonCard } from '@/components/SkeletonCard';
import styles from './FeedPage.module.css';
import type { FeedItem } from '@brainheal/storage';

/**
 * Main feed screen.
 * Vertically scrollable list of PostView components.
 * FAB to add content. Empty state when all caught up.
 */
export function FeedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, loading, error, loadMore, hasMore, removeItem, refreshItem, insertItem } = useFeed(
    user?.id ?? null,
  );

  const handleAddContent = useCallback(() => {
    navigate('/add');
  }, [navigate]);

  if (loading && items.length === 0) {
    return (
      <div className={styles.container}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonWrapper}>
            <SkeletonCard />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon} aria-hidden="true">⚠</p>
        <h2 className={styles.emptyTitle}>Something went wrong</h2>
        <p className={styles.emptyText}>{error}</p>
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon} aria-hidden="true">✨</p>
        <h2 className={styles.emptyTitle}>All caught up!</h2>
        <p className={styles.emptyText}>Add something to read.</p>
        <button
          type="button"
          className={styles.emptyAddButton}
          onClick={handleAddContent}
          aria-label="Add content to read"
        >
          + Add content
        </button>

        {/* Add content FAB */}
        <button
          type="button"
          className={styles.fab}
          onClick={handleAddContent}
          aria-label="Add content"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {items.map((item: FeedItem) => {
        if (!item.post) {
          return (
            <div key={item.id} className={styles.postWrapper}>
              <SkeletonCard feedItem={item} />
            </div>
          );
        }
        return (
          <div key={item.id} className={styles.postWrapper}>
            <PostView
              feedItem={item}
              onRead={removeItem}
              onSnooze={refreshItem}
              onItemQueued={insertItem}
            />
          </div>
        );
      })}

      {/* Load more */}
      {hasMore && (
        <button
          type="button"
          className={styles.loadMoreButton}
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}

      {/* FAB */}
      <button
        type="button"
        className={styles.fab}
        onClick={handleAddContent}
        aria-label="Add content"
      >
        +
      </button>
    </div>
  );
}
