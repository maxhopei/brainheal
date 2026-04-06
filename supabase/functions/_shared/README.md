# @brainheal/shared

Shared code for the BrainHeal monorepo. Used by all workspace members.

In Supabase functions, import via the relative path, i.e., `../_shared`.

In other modules, import via the `@brainheal/shared` workspace alias.

## Usage

```typescript
import type { FeedItem, Card, QueueItem } from '@brainheal/shared';
```

## Running Tests

```bash
deno test --allow-all supabase/functions/_shared/
```
