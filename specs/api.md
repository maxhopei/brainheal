# BrainHeal — API Design

This document covers all client↔backend API interactions beyond authentication. For auth, see [auth.md](./auth.md). For the ingestion Edge Function, see [content-ingestion.md](./content-ingestion.md).

---

## 1. Data Reads (PostgREST)

All reads go through `supabase.from()`, which calls Supabase PostgREST. RLS policies enforce per-user data isolation.

### Feed (unread, oldest first, paginated)

```typescript
const { data, error } = await supabase
  .from('feed_items')
  .select(`
    id, position, state, source_type, shared_by_user_id, shared_message,
    queue_item:queue_items(status, error_message),
    post:posts(
      id, title, status, source_url, error_message,
      cards(id, position, content_type, text_content, media_url, media_caption)
    )
  `)
  .eq('state', 'unread')
  .order('position', { ascending: true })
  .range(0, 19);
```

### Queue Items

```typescript
const { data, error } = await supabase
  .from('queue_items')
  .select('*')
  .order('created_at', { ascending: false });
```

### Favorites (Groups with Posts)

```typescript
const { data, error } = await supabase
  .from('favorite_groups')
  .select(`
    id, name, position, is_default,
    favorites(id, post:posts(id, title, source_url, cards(id, position, content_type, text_content)))
  `)
  .order('position', { ascending: true });
```

### Single Post

```typescript
const { data, error } = await supabase
  .from('posts')
  .select('*, cards(*)')
  .eq('id', postId)
  .single();
```

---

## 2. Atomic Operations (Postgres RPC)

Operations that need transactions or computed values use Postgres functions called via `supabase.rpc()`.

### Snooze a Feed Item (Move to Bottom)

SQL function:

```sql
CREATE OR REPLACE FUNCTION snooze_feed_item(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE feed_items
  SET position = (
    SELECT COALESCE(MAX(position), 0) + 1
    FROM feed_items
    WHERE user_id = auth.uid()
  )
  WHERE id = item_id AND user_id = auth.uid();
END;
$$;
```

Client call:

```typescript
const { error } = await supabase.rpc('snooze_feed_item', { item_id: feedItemId });
```

### Mark Feed Item as Read

SQL function:

```sql
CREATE OR REPLACE FUNCTION mark_feed_item_read(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE feed_items
  SET state = 'read', read_at = now()
  WHERE id = item_id AND user_id = auth.uid();
END;
$$;
```

Client call:

```typescript
const { error } = await supabase.rpc('mark_feed_item_read', { item_id: feedItemId });
```

---

## 3. Simple Writes (PostgREST)

Simple inserts and deletes that don't need business logic go directly through PostgREST. RLS ensures users can only modify their own data.

### Save to Favorites

```typescript
await supabase.from('favorites').insert({
  user_id: userId,
  post_id: postId,
  group_id: groupId ?? defaultGroupId,
});
```

### Remove from Favorites

```typescript
await supabase.from('favorites').delete().eq('id', favoriteId);
```

### Add Reaction

```typescript
await supabase.from('reactions').upsert(
  { user_id: userId, post_id: postId, type: 'like' },
  { onConflict: 'user_id,post_id' }
);
```

### Remove Reaction

```typescript
await supabase.from('reactions').delete().match({ user_id: userId, post_id: postId });
```

### Create Favorite Group

```typescript
await supabase.from('favorite_groups').insert({
  user_id: userId,
  name: 'Tech Articles',
  position: nextPosition,
  is_default: false,
});
```

### Delete Post (Cascades to Feed Item)

```typescript
await supabase.from('posts').delete().eq('id', postId);
```

---

## 4. Realtime Subscriptions

The client subscribes to database changes to receive live updates without polling.

### Feed Updates (Processing → Ready)

```typescript
supabase
  .channel('feed-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'feed_items',
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      // feed_item updated (e.g., post_id set when processing completes)
      // refresh the affected feed item in local state
    }
  )
  .subscribe();
```

This replaces polling for the feed. When the Fly.io worker finishes processing and updates `feed_item`, the client receives the change in realtime.

---

## 5. Stripe Webhook Edge Function

Handles Stripe billing events (Phase 2).

Edge Function logic:

1. Verify Stripe webhook signature.
2. Handle `checkout.session.completed`, `customer.subscription.updated`, etc.
3. Update `profiles.billing_tier` accordingly.

---

## 6. Admin Access

For MVP, admin operations use the **Supabase Dashboard** directly:

- SQL editor for ad-hoc queries (queue depth, cost reports, user stats).
- Table editor for managing data.
- Auth dashboard for managing users.
- Logs for Edge Function and Realtime debugging.

Phase 2: Custom admin UI if needed, using the `service_role` key (bypasses RLS).
