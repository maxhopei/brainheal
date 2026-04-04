# Specs

| File | Contents |
|---|---|
| [overview.md](overview.md) | Problem, solution, key principles, MVP scope, open questions |
| [architecture.md](architecture.md) | System diagram, component mapping, tech stack, API layers, deployment, NFRs |
| [data-model.md](data-model.md) | ERD, table schemas, triggers, key design decisions, RLS policies |
| [content-ingestion.md](content-ingestion.md) | Input channels, ingestion flow, card generation, error handling, cost management |
| [ingestion-modes.md](ingestion-modes.md) | Immediate vs. deferred processing modes, architecture, trade-offs, configuration |
| [feed.md](feed.md) | Posts & cards, feed behaviour, gestures, realtime updates, UX screens & navigation |
| [auth.md](auth.md) | Auth flow, session management, profile, Edge Function JWT validation |
| [api.md](api.md) | PostgREST reads, RPC atomic ops, simple writes, Realtime subscriptions, admin |
| [social-features.md](social-features.md) | Favorites, reactions, recommendations, in-app sharing, external sharing |
| [billing.md](billing.md) | Pricing tiers, Stripe integration, LLM cost budgets |
| [card-qa.md](card-qa.md) | In-feed Q&A about cards — UX, Edge Function, billing, schema changes |
| [read-next.md](read-next.md) | Select terms/links in cards to queue related content, inserted after current post |
