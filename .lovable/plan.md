## Problem

Saving Business Profile locks a previously unlocked account.

`handleSave` in `src/routes/_authenticated.app.settings.tsx` (line 111–131) builds a `payload` from form fields only and calls `profileStore.save(payload)`. That overwrites the whole local profile snapshot — dropping `unlocked`, `bookedAt`, `fullName`, and `email`.

`AppShell` then evaluates:

```
locked = signedIn && profile.unlocked !== true
```

Because `unlocked` is now `undefined`, the account is treated as locked until `useProfileSync` re-hydrates from the server on the next full load.

Server-side `saveProfile` is fine — it does not touch `unlocked` — so this is purely a client-cache bug.

## Fix

In `src/routes/_authenticated.app.settings.tsx` `handleSave`, merge the form payload with the existing profile snapshot so admin/user metadata survives:

```ts
const current = profileStore.getSnapshot();
profileStore.save({
  ...current,        // preserves unlocked, bookedAt, fullName, email
  ...payload,        // overwrites the editable business-profile fields
});
```

Keep the server call (`persistProfile({ data: payload })`) unchanged — its schema intentionally excludes `unlocked`.

No other files need changes.
