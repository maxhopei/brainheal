# BrainHeal — Authentication & Accounts

## 1. Overview

Authentication is handled entirely by **Supabase Auth**. No custom auth backend.

---

## 2. Registration & Login

- Email + password registration (Supabase Auth built-in).
- Third-party OAuth: Google, Apple (Supabase Auth providers).
- The process must be minimal — get the user into the app quickly.

---

## 3. Client-Side Auth Flow

The frontend uses `@supabase/supabase-js` SDK for all auth operations.

| Operation      | Client Code                                             |
| -------------- | ------------------------------------------------------- |
| Register       | `supabase.auth.signUp({ email, password })`             |
| Login (email)  | `supabase.auth.signInWithPassword({ email, password })` |
| Login (Google) | `supabase.auth.signInWithOAuth({ provider: 'google' })` |
| Login (Apple)  | `supabase.auth.signInWithOAuth({ provider: 'apple' })`  |
| Logout         | `supabase.auth.signOut()`                               |
| Get session    | `supabase.auth.getSession()`                            |
| Get user       | `supabase.auth.getUser()`                               |

JWT access tokens and refresh tokens are managed automatically by the Supabase SDK. The SDK stores the session in `localStorage` and refreshes tokens transparently.

---

## 4. User Profile

- Supabase manages `auth.users` (email, auth metadata). This table is not directly accessible to the app.
- A `profiles` table in the `public` schema extends the user with app-specific data (nickname, billing tier).
- A database trigger automatically creates a `profiles` row when a new `auth.users` row is inserted. See [data-model.md](./data-model.md) for the trigger SQL.

---

## 5. Account Data

The user's account holds:

- Feed state (positions, read/unread).
- Favorites and groups.
- Reactions history.
- Preferences.
- Billing tier.

---

## 6. Sessions

- JWT-based (managed by Supabase Auth).
- Access tokens: 1 hour (Supabase default).
- Refresh tokens: long-lived, rotated by SDK automatically.
- Account accessible from any device — feed state syncs via Supabase.

---

## 7. Edge Function JWT Validation

Every Edge Function must validate the user's JWT. The Supabase SDK does this automatically when the client is created with the request's Authorization header:

```typescript
// In Edge Function (Deno)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
);

// This call validates the JWT and returns the authenticated user
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}
```
