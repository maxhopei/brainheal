# BrainHeal — Billing

Status: 🤷🏻 Planned (partially weaved in)

## 1. Tiers [Low — Phase 2]

| Tier     | Limits                         | Recommendations |
| -------- | ------------------------------ | --------------- |
| **Free** | N articles/month (TBD, ~30)    | No              |
| **Paid** | Higher limit (TBD, ~300/month) | Yes             |

- Payment via **Stripe** (subscription billing).
- Free tier should be generous enough to evaluate the app.
- Paid tier should cover comfortable daily use.
- Billing tier is stored on `profiles.billing_tier` (`'free' | 'paid'`).

---

## 2. Stripe Integration

Stripe events are handled by the `stripe-webhook` Supabase Edge Function.

**Webhook Edge Function steps:**

1. Verify Stripe webhook signature (using `Stripe-Signature` header + webhook secret).
2. Parse the event type.
3. Handle relevant events:
   - `checkout.session.completed` → upgrade user to paid tier
   - `customer.subscription.updated` → sync tier changes
   - `customer.subscription.deleted` → downgrade to free tier
4. Update `profiles.billing_tier` accordingly.

**Client-side (initiate checkout):**

```typescript
const { data, error } = await supabase.functions.invoke('create-checkout-session', {
  body: { priceId: 'price_xxx' }
});
// redirect user to data.url (Stripe Checkout)
```

---

## 3. LLM Cost Budget

Each user has a monthly LLM processing budget tied to their billing tier. The worker enforces this budget before each processing job. See [content-ingestion.md](./content-ingestion.md#5-cost-management) for full details.

| Tier   | Monthly budget (indicative) |
| ------ | --------------------------- |
| Free   | TBD (e.g., ~$1)             |
| Paid   | TBD (e.g., ~$10)            |
