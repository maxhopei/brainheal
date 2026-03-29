import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { FeedItem } from '@brainheal/shared';

const PAGE_SIZE = 20;

type UseFeedReturn = {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  removeItem: (feedItemId: string) => void;
  refreshItem: (feedItemId: string) => void;
};

/**
 * Fetches the user's unread feed items (oldest first, paginated).
 * Subscribes to Supabase Realtime for live updates when processing completes.
 * Handles skeleton state (post_id=null) and Realtime merge on update.
 */
export function useFeed(userId: string | null): UseFeedReturn {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const fetchPage = useCallback(
    async (pageOffset: number, replace: boolean) => {
      if (!userId) return;
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('feed_items')
        .select(`
          id, position, state, source_type, shared_by_user_id, shared_message,
          created_at, read_at,
          queue_item:queue_items(id, status, error_message, input_type, input_value, retry_count, created_at, started_at, completed_at),
          post:posts(
            id, title, status, source_url, source_text, error_message, created_at, updated_at,
            cards(id, position, content_type, text_content, media_url, media_caption, created_at)
          )
        `)
        .eq('state', 'unread')
        .order('position', { ascending: true })
        .range(pageOffset, pageOffset + PAGE_SIZE - 1);

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const fetched = (data ?? []) as unknown as FeedItem[];

      setItems((prev) => {
        if (replace) return fetched;
        return [...prev, ...fetched];
      });
      setHasMore(fetched.length === PAGE_SIZE);
      setLoading(false);
    },
    [userId],
  );

  // Initial load
  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setOffset(0);
    fetchPage(0, true);
  }, [userId, fetchPage]);

  // Realtime subscription — merge post data when feed_item is updated
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`feed-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'feed_items',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const updatedItemId = (payload.new as { id: string }).id;
          const newState = (payload.new as { state: string }).state;

          // If item was read/snoozed, handle state transitions
          if (newState === 'read') {
            setItems((prev) => prev.filter((item) => item.id !== updatedItemId));
            return;
          }

          // Otherwise, re-fetch the updated item to get fresh post/card data
          const { data } = await supabase
            .from('feed_items')
            .select(`
              id, position, state, source_type, shared_by_user_id, shared_message,
              created_at, read_at,
              queue_item:queue_items(id, status, error_message, input_type, input_value, retry_count, created_at, started_at, completed_at),
              post:posts(
                id, title, status, source_url, source_text, error_message, created_at, updated_at,
                cards(id, position, content_type, text_content, media_url, media_caption, created_at)
              )
            `)
            .eq('id', updatedItemId)
            .single();

          if (data) {
            const updatedItem = data as unknown as FeedItem;
            setItems((prev) => {
              const idx = prev.findIndex((item) => item.id === updatedItemId);
              if (idx === -1) {
                // New item (shouldn't happen for updates, but handle gracefully)
                return [...prev, updatedItem].sort((a, b) => a.position - b.position);
              }
              const next = [...prev];
              next[idx] = updatedItem;
              // Re-sort by position in case snooze changed position
              return next.sort((a, b) => a.position - b.position);
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const loadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchPage(nextOffset, false);
  }, [offset, fetchPage]);

  /**
   * Remove an item from the local feed state (used after mark-as-read).
   */
  const removeItem = useCallback((feedItemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== feedItemId));
  }, []);

  /**
   * Re-fetch a single item (used after snooze — position changes).
   */
  const refreshItem = useCallback(
    async (feedItemId: string) => {
      const { data } = await supabase
        .from('feed_items')
        .select(`
          id, position, state, source_type, shared_by_user_id, shared_message,
          created_at, read_at,
          queue_item:queue_items(id, status, error_message, input_type, input_value, retry_count, created_at, started_at, completed_at),
          post:posts(
            id, title, status, source_url, source_text, error_message, created_at, updated_at,
            cards(id, position, content_type, text_content, media_url, media_caption, created_at)
          )
        `)
        .eq('id', feedItemId)
        .single();

      if (data) {
        const refreshed = data as unknown as FeedItem;
        setItems((prev) => {
          const filtered = prev.filter((item) => item.id !== feedItemId);
          return [...filtered, refreshed].sort((a, b) => a.position - b.position);
        });
      }
    },
    [],
  );

  return { items, loading, error, hasMore, loadMore, removeItem, refreshItem };
}

// Re-export type for use in components
export type { Session };
