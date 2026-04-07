# BrainHeal — Card Q&A

## 1. Overview

While reading a card the user can ask free-form questions about the content.
The question is sent to the LLM together with the full article context,
and the answer is returned inline. The conversation is ephemeral — it lives
only in client memory and is discarded when the post is marked as read or
the user navigates away.

The feature is **paid-tier only** and uses the same daily LLM budget as
content ingestion.

---

## 2. UX

### Input bar

A persistent text input ("Ask about this…") sits at the bottom of the feed
screen, above the navigation bar. It is always visible while scrolling the
feed and is enabled only when:

1. The user's billing tier is `paid`.
2. There is an active post in view (at least one card on screen).

When conditions aren't met the input is visible but disabled, with a hint:

| Condition          | Placeholder text                            |
| ------------------ | ------------------------------------------- |
| Free-tier user     | "Upgrade to ask questions"                  |
| No active post     | "Scroll to a post to ask a question"        |
| Budget exceeded    | "Daily budget reached — try again tomorrow" |
| Normal (enabled)   | "Ask about this…"                           |

Tapping the input opens the keyboard and expands a **Q&A sheet** that
overlays the bottom half of the screen. The current card remains partially
visible above the sheet for context.

### Active post detection

The app determines which post the user is currently reading by combining:

- **Intersection Observer**: the post whose container has the largest
  visible area in the viewport.
- **Last interaction**: updated on any card swipe or gesture within a post.

The two signals are merged: interaction always wins; Intersection Observer
is the fallback when the user has only scrolled without interacting.

The active `card_id` is the card currently displayed (horizontal position
within the active post).

### Q&A sheet

```
┌─────────────────────────────────────────┐
│  ← partially visible card above         │
├─────────────────────────────────────────┤
│                                         │
│  Q: What does "amortised O(1)" mean     │
│     in this context?                    │
│                                         │
│  A: In the context of this article,     │
│     amortised O(1) means that while a   │
│     single operation might occasionally │
│     take longer, the average cost over  │
│     a sequence of operations is …       │
│                                         │
│  Q: How does that compare to a linked   │
│     list?                               │
│                                         │
│  A: (loading…)                          │
│                                         │
├─────────────────────────────────────────┤
│  [ Ask about this…                    ➤]│
└─────────────────────────────────────────┘
```

- Questions and answers are rendered as a simple chat-style thread.
- While the LLM is responding, a typing/loading indicator is shown.
- The sheet is scrollable if the conversation grows long.
- Dismissing the sheet (swipe down or tap outside) keeps the conversation
  in memory. Re-opening restores it — until the post is marked as read.
- When the post is marked as read (swipe-left on last card), the
  conversation is discarded.

### Conversation lifecycle

| Event                               | Effect on conversation         |
| ----------------------------------- | ------------------------------ |
| User asks a question                | Appended to in-memory history  |
| LLM responds                        | Appended to in-memory history  |
| User dismisses Q&A sheet            | History retained in memory     |
| User re-opens Q&A sheet (same post) | History restored               |
| Active post changes (scroll away)   | Previous post's history kept until read |
| Post marked as read                 | History discarded              |
| App reload / navigation away        | History discarded              |

---

## 3. Edge Function: `card-qa`

A new Supabase Edge Function handles Q&A requests synchronously.

### Request

```typescript
// POST /functions/v1/card-qa
type CardQARequest = {
  post_id: string;
  card_id: string;
  question: string;
  conversation: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
};
```

`conversation` contains the previous exchanges in this session. On the first
question it is an empty array. The client appends each Q&A pair locally and
sends the full history with every subsequent request.

### Response

```typescript
// 200 OK
type CardQAResponse = {
  answer: string;
  usage: {
    tokens_input: number;
    tokens_output: number;
    cost_usd: number;
  };
};

// 402 Payment Required (free-tier user)
// 429 Too Many Requests (daily budget exceeded)
// 400 Bad Request (validation error)
// 500 Internal Server Error
type CardQAErrorResponse = {
  error: string;
};
```

### Processing steps

1. **Authenticate**: extract user from JWT (`supabase.auth.getUser()`).
2. **Check billing tier**: query `profiles.billing_tier`. Reject with 402 if
   `free`.
3. **Check daily budget**: reuse the same budget logic as the worker
   (sum of `cost_records.cost_usd` for the user this billing period vs.
   the daily limit). Reject with 429 if exceeded.
4. **Validate input**: `post_id` and `card_id` must be valid UUIDs;
   `question` must be 1–1000 characters; `conversation` must have
   ≤ 20 entries (10 exchanges).
5. **Load post + cards**: fetch the post and its cards from the database.
   Verify the post belongs to the authenticated user.
6. **Assemble article context** (see §4).
7. **Build LLM messages** (see §5).
8. **Call LLM**: use the same provider abstraction as the worker
   (`LLM_PROVIDER` env var). Temperature 0.4, max tokens 1024.
9. **Record cost**: insert into `cost_records` with `source = 'qa'` and
   `post_id` set.
10. **Return answer + usage**.

### Client call

```typescript
const { data, error } = await supabase.functions.invoke('card-qa', {
  body: {
    post_id: activePost.id,
    card_id: activeCard.id,
    question: userQuestion,
    conversation: conversationHistory,
  },
});
```

---

## 4. Context Assembly

The LLM receives the full article text (not just cards) so it can answer
questions that go beyond the summary.

### URL-type posts

The Edge Function **re-fetches** the article from `posts.source_url` using
the same Readability-based extraction as the worker. This avoids storing
large article bodies in the database.

Trade-offs:

- Adds 1–5 s latency per question.
- May fail if the URL is no longer reachable.
- Paywalled content that was accessible at ingestion time may not be
  accessible later.

If the re-fetch fails, the function falls back to using only the card texts
as context and includes a note in the system prompt: "The original article
could not be retrieved; answer based on the summary cards only."

### Text-type posts

For posts created from free-text topics, the worker's `researchTopic` output
is persisted in a new `posts.article_body` column during processing. The
Edge Function reads this column directly — no re-fetch or re-research needed.

### Context payload

Regardless of source, the context sent to the LLM includes:

| Component        | Source                                        |
| ---------------- | --------------------------------------------- |
| Post title       | `posts.title`                                 |
| Source URL        | `posts.source_url` (if any)                   |
| Full article     | Re-fetched text or `posts.article_body`        |
| All card texts   | `cards.text_content`, ordered by `position`    |
| Current card     | Highlighted by `card_id` so the LLM knows the user's focus |

---

## 5. LLM Prompt

### System prompt

```
You are a helpful reading assistant for the app BrainHeal.

The user is reading a summarized article and has a question. Answer using
the article content provided below. Be concise: 1–3 short paragraphs.

If the question cannot be answered from the article, say so clearly, then
provide a brief answer from your general knowledge and note that it is not
from the article.

Do not repeat the card summaries back to the user. Add value beyond what
the cards already say.
```

### Message structure

```
[system]  <system prompt above>

[user]    <context block — sent once as the first user message>
          ---
          Title: {post.title}
          Source: {post.source_url ?? "Free-text topic"}

          Article:
          {article_text}

          Summary cards:
          Card 1: {card_1_text}
          Card 2: {card_2_text}
          ...

          The user is currently viewing Card {position}: {current_card_text}
          ---

[user]    {question_1}
[assistant] {answer_1}
[user]    {question_2}
[assistant] {answer_2}
...
[user]    {latest_question}
```

The context block is always the first user message. Follow-up exchanges are
appended as alternating user/assistant messages. This gives the LLM full
conversational context without re-sending the article each turn (the article
is in the first message, which remains in the message history).

### Token budget

| Parameter     | Value |
| ------------- | ----- |
| Max input     | ~8 000 tokens of article text (truncate with notice if longer) |
| Max output    | 1 024 tokens |
| Temperature   | 0.4   |
| Conversation cap | 20 messages (10 exchanges) — older messages trimmed from the middle, keeping the first (context) and last 4 exchanges |

---

## 6. Schema Changes

### `posts.article_body`

New nullable text column on the `posts` table. Populated by the worker
during processing for **text-type** posts only (stores the research text).
NULL for URL-type posts (article is re-fetched on demand).

```sql
ALTER TABLE posts ADD COLUMN article_body text;
```

### `cost_records` modifications

Two changes to support Q&A cost tracking alongside ingestion costs:

1. **`queue_item_id` becomes nullable** — Q&A costs are not associated with
   a queue item.
2. **New `post_id` column** (nullable FK → `posts.id`) — links Q&A costs to
   the post being discussed.
3. **New `source` column** — distinguishes cost origin.

```sql
ALTER TABLE cost_records
  ALTER COLUMN queue_item_id DROP NOT NULL;

ALTER TABLE cost_records
  ADD COLUMN post_id uuid REFERENCES posts(id) ON DELETE SET NULL;

ALTER TABLE cost_records
  ADD COLUMN source text NOT NULL DEFAULT 'ingestion'
  CHECK (source IN ('ingestion', 'qa'));
```

Existing rows get `source = 'ingestion'` via the default. The daily budget
query (`SUM(cost_usd)` for the current billing period) remains unchanged —
it naturally includes both ingestion and Q&A costs.

### RLS for `cost_records`

Existing policies already restrict SELECT to `user_id = auth.uid()`. No
change needed. The Edge Function inserts using the service role client (same
as the worker).

---

## 7. Billing & Cost

Q&A uses the **same monthly budget and daily limit** as content ingestion.
No separate quotas.

### Budget check flow

```
remaining_budget = monthly_budget − sum(costs this billing period)
daily_limit = remaining_budget / remaining_days_in_period
allowed = sum(today's costs) < daily_limit
```

This is the same formula used by the worker (see `worker/src/budget.ts`).
The Edge Function calls the same `check_daily_budget` RPC or re-implements
the same logic.

### Cost per question (estimated)

A typical Q&A exchange sends ~2 000–4 000 input tokens (article + cards +
conversation) and receives ~200–400 output tokens. At Haiku pricing:

| Component | Tokens | Cost         |
| --------- | ------ | ------------ |
| Input     | ~3 000 | ~$0.0024     |
| Output    | ~300   | ~$0.0012     |
| **Total** |        | **~$0.004**  |

A paid-tier user with a $10/month budget could ask roughly **80 questions/day**
(30-day month) if they used the entire budget on Q&A, which provides ample
room for mixed ingestion + Q&A usage.

### Free-tier gating

Free-tier users see the input bar but it is disabled with the placeholder
"Upgrade to ask questions". The Edge Function also enforces this server-side
(returns 402 if `billing_tier = 'free'`).

---

## 8. Error Handling

| Scenario                           | Handling                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Free-tier user                     | 402 — client shows upgrade prompt                                        |
| Daily budget exceeded              | 429 — client shows "Daily budget reached" in input placeholder           |
| Article re-fetch fails (URL post)  | Fall back to card-only context; answer includes caveat                    |
| LLM API error                      | 500 — client shows "Something went wrong, try again"                     |
| LLM timeout (>30 s)               | 504 — client shows timeout message                                       |
| Question too long (>1 000 chars)   | 400 — client-side validation prevents this; server validates as backup   |
| Conversation too long (>20 msgs)   | Client trims oldest exchanges before sending; server validates as backup |
| Post not found / not owned by user | 404 — client should not hit this in normal usage                         |

---

## 9. Security

- **Auth**: JWT validated via `supabase.auth.getUser()` in the Edge Function.
  Unauthenticated requests are rejected.
- **Ownership**: the Edge Function verifies `posts.user_id = auth.uid()`
  before returning any data or calling the LLM.
- **Input sanitization**: question text is passed to the LLM as a user
  message. No special sanitization beyond length limits — the LLM handles
  arbitrary user input. The question is never executed as code or SQL.
- **Cost protection**: daily budget check prevents runaway LLM costs from
  rapid-fire questions.
- **Conversation history**: sent from the client and untrusted. The server
  treats it as opaque LLM context. A malicious client could send fabricated
  history, but this only affects their own LLM responses and their own
  budget — no security impact on other users.

---

## 10. Edge Function Environment

The `card-qa` Edge Function requires the same LLM credentials as the worker:

| Variable               | Required                      |
| ---------------------- | ----------------------------- |
| `LLM_PROVIDER`         | Yes                           |
| `LLM_MODEL`            | No (uses provider default)    |
| `OPENAI_API_KEY`       | When `LLM_PROVIDER=openai`    |
| `ANTHROPIC_API_KEY`    | When `LLM_PROVIDER=anthropic` |
| `AWS_ACCESS_KEY_ID`    | When `LLM_PROVIDER=bedrock`   |
| `AWS_SECRET_ACCESS_KEY`| When `LLM_PROVIDER=bedrock`   |
| `AWS_REGION`           | When `LLM_PROVIDER=bedrock`   |

These are set as Supabase Edge Function secrets (`supabase secrets set`).

---

## 11. Shared Code Considerations

The Edge Function and the worker both need:

- **LLM provider abstraction** (`llm.ts`): currently lives in `worker/src/`.
  The Q&A function needs a simpler variant (single chat call, no JSON
  parsing). Options:
  - Extract common LLM call logic into `@brainheal/llm`.
  - Duplicate a thin LLM chat function in the Edge Function (simpler,
    avoids coupling).
- **Article fetcher** (`fetcher.ts`): needed for re-fetching URL articles.
  Same choice: share or duplicate. The fetcher depends on `@mozilla/readability`
  and `linkedom` — verify these work within Edge Function deployment size
  limits.
- **Budget check** (`budget.ts`): extract into `@brainheal/llm` or
  implement as a Postgres RPC callable from both worker and Edge Function.

Recommended approach: implement budget as a **Postgres RPC** (`check_daily_budget`)
so both the worker and Edge Function can call `supabase.rpc('check_daily_budget')`
without duplicating the SQL logic. Move the LLM abstraction and fetcher into
`@brainheal/llm` as a Phase 2 cleanup — for the initial implementation,
a focused LLM chat function within the Edge Function is acceptable.

---

## 12. Future Considerations

- **Persist article body for URL posts**: storing the fetched article in
  `posts.article_body` at ingestion time would eliminate re-fetch latency
  and failure risk. Trade-off: increased database storage.
- **Streaming responses**: the Edge Function could stream the LLM response
  using SSE (Server-Sent Events) for a more responsive feel. Supabase Edge
  Functions support streaming.
- **Suggested questions**: after card generation, the LLM could pre-generate
  2–3 suggested questions per card, shown as tap-to-ask chips above the
  input bar.
- **Persisted conversations**: if users want to revisit past Q&A, the
  conversations could be stored in a `qa_conversations` table. Not in scope
  for this version.
