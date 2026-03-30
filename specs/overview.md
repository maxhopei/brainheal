# BrainHeal — Overview

## 1. What Is BrainHeal?

**BrainHeal** is a personal content reader that transforms bookmarked articles and topics into bite-sized, Instagram-style card feeds. It replaces the anxiety of accumulating bookmarks and the habit of doom-scrolling with a focused, self-curated reading experience.

### 1.1 Problem

People discover interesting content (articles, newsletters, recommendations) but lack time or energy to read it immediately. Bookmarks pile up, creating overwhelm, anxiety, and FOMO. Meanwhile, social media feeds fill idle moments with algorithmically-chosen content.

### 1.2 Solution

When a user finds something interesting, they send it to BrainHeal — a URL or a free-text topic. The app fetches and summarizes the content into short, readable **cards** grouped into **posts**. These appear in a deterministic, chronological feed the user controls completely.

### 1.3 Key Principles

- **User-curated**: All content is explicitly chosen by the user. No algorithmic surprises.
- **Deterministic feed**: The feed order is fixed (oldest-first) and never reshuffled.
- **Bite-sized reading**: Cards are concise — each readable in 10–30 seconds.
- **Explicit control**: Read/snooze states are controlled by deliberate gestures, not inferred.
- **Low friction**: Submitting content must be as easy as sharing a link.

---

## 2. MVP Scope

The MVP is a **mobile-first web app (PWA)** backed by **Supabase** + **Fly.io worker**.

| Feature                                    | Included in MVP |
| ------------------------------------------ | --------------- |
| In-app content submission (URL + text)     | Yes             |
| OS Share Sheet (PWA share target)          | Yes             |
| Content processing (fetch + LLM summarize) | Yes             |
| Card feed with swipe navigation            | Yes             |
| Read / snooze gestures                     | Yes             |
| Email + password auth (Supabase Auth)      | Yes             |
| OAuth — Google (Supabase Auth)             | Yes             |
| Realtime feed updates (Supabase Realtime)  | Yes             |
| Processing queue view                      | Yes             |
| Favorites with groups                      | Yes             |
| Browser extension                          | Phase 2         |
| Reactions (like/meh)                       | Phase 2         |
| Recommendations                            | Phase 3         |
| In-app sharing                             | Phase 3         |
| External sharing                           | Phase 3         |
| Billing / Stripe                           | Phase 2         |
| Search (PG full-text)                      | Phase 2         |
| Offline support                            | Phase 2         |
| iOS native app                             | Phase 3         |

---

## 3. Open Questions & Decisions

| #   | Question                                                                                                                                                                                       | Impact                     | Status                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| 1   | **LLM provider**: OpenAI vs Anthropic vs AWS Bedrock?                                                                                                                                          | Cost, quality, latency     | **Decided**: All three supported. Selected via `LLM_PROVIDER` env var. Bedrock (Converse API) is the recommended default for production — it supports any Bedrock-hosted model (default: Claude 3.5 Haiku). Direct OpenAI and Anthropic providers remain available. |
| 2   | **Free tier limits**: How many articles/month?                                                                                                                                                 | Business model             | TBD                                                                       |
| 3   | **Paid tier pricing**: Monthly cost? Article limits?                                                                                                                                           | Business model             | TBD                                                                       |
| 4   | **Card text formatting**: Plain text, markdown, or limited rich text?                                                                                                                          | Frontend complexity        | Markdown                                                                  |
| 5   | **PWA Share Target**: Requires HTTPS + service worker + manifest. Confirm this meets "share sheet" expectation or if a native wrapper (e.g., Capacitor) is needed for reliable mobile sharing. | UX of primary input method | Needs validation                                                          |
| 6   | **Budget carryover cap**: Should unused budget accumulate indefinitely or cap at N months?                                                                                                     | Cost risk                  | Budget accumulates within one month (billing period). Resets every month. |
| 7   | **Multi-post splitting**: Should the LLM autonomously split a long article into multiple posts, or always produce one post?                                                                    | UX complexity              | LLM decides. Instructions and suggestions are in the system prompt.       |
| 8   | **Supabase plan**: Free tier has limits (500MB DB, 50K auth users, 500K Edge Function invocations). When to upgrade to Pro ($25/month)?                                                        | Cost planning              | Monitor usage                                                             |
| 9   | **Worker polling interval**: How often should the Fly.io worker poll the queue? Tradeoff: latency vs DB load.                                                                                  | Processing speed vs cost   | Start with 5s                                                             |
| 10  | **Supabase Realtime for queue status**: Should the queue/history screen also use Realtime subscriptions, or is polling sufficient there?                                                       | UX polish                  | Polling is ok                                                             |
