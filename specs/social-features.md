# BrainHeal — Social Features

Covers: Favorites, Reactions, Recommendations, In-App Sharing, External Sharing.

---

## 1. Favorites [Medium — MVP]

Users can save posts to organized collections.

- **Default group**: "Saved" (always exists, cannot be deleted).
- **Custom groups**: User-created, one level deep (no nesting).
- **Save flow**: Tap "save" → immediately saved to "Saved" group → inline UI to pick/create a different group.
- A post can exist in **one group only**.
- Favorited posts persist even after being marked as read.

### Data

See `favorite_groups` and `favorites` tables in [data-model.md](./data-model.md).

### API

```typescript
// Save post to favorites
await supabase.from('favorites').insert({
  user_id: userId,
  post_id: postId,
  group_id: groupId ?? defaultGroupId,
});

// Remove from favorites
await supabase.from('favorites').delete().eq('id', favoriteId);

// Create a new group
await supabase.from('favorite_groups').insert({
  user_id: userId,
  name: 'Tech Articles',
  position: nextPosition,
  is_default: false,
});

// Read favorites (groups with nested posts)
const { data } = await supabase
  .from('favorite_groups')
  .select(`
    id, name, position, is_default,
    favorites(id, post:posts(id, title, source_url, cards(id, position, content_type, text_content)))
  `)
  .order('position', { ascending: true });
```

---

## 2. Reactions [Low — Phase 2]

Two reaction types:

| Reaction | Meaning                        | Used for                          |
| -------- | ------------------------------ | --------------------------------- |
| **Like** | "This was valuable"            | Recommendations (positive signal) |
| **Meh**  | "Not interested in this topic" | Recommendations (negative signal) |

- Reactions are mutually exclusive per post (one reaction at a time).
- Reactions can be changed or removed.

### API

```typescript
// Add or change reaction (upsert)
await supabase.from('reactions').upsert(
  { user_id: userId, post_id: postId, type: 'like' },
  { onConflict: 'user_id,post_id' }
);

// Remove reaction
await supabase.from('reactions').delete().match({ user_id: userId, post_id: postId });
```

---

## 3. Recommendations [Low — Phase 3]

When the feed is empty (all content read), the app suggests new topics.

### Behavior

- Based on: liked posts (positive signal), meh'd posts (negative signal), topic history.
- Suggestions are **topic proposals**, not pre-generated posts. The user must explicitly tap to generate.
- Each suggestion includes a reason.

### Suggestion Card Format

```
[Topic title or question]

Because you were interested in [related topic].
```

- Suggestions are visually distinct from user-submitted content.
- Tapping a suggestion triggers the standard ingestion flow (as if the user typed the topic).

---

## 4. In-App Sharing [Extra-low — Phase 3]

- Share a post with another BrainHeal user by nickname.
- Recent share contacts are suggested.
- Shared posts appear in the recipient's feed, clearly marked with sender info and an optional message.
- Shared content is visually distinct (badge/label showing who shared it).

### Data

The `feed_items` table carries:
- `source_type: 'shared'`
- `shared_by_user_id` → the sender's profile ID
- `shared_message` → optional message from sender

---

## 5. External Sharing [Low — Phase 3]

- Standard OS share sheet integration.
- Shared content includes: first card text + link to web view of the post.
- Web view is a public, read-only rendered version of the post (requires a public URL scheme).
