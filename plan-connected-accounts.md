# Connected Accounts Implementation Plan

## Objective

Give users a way to link and unlink their X account, and make the sync UI aware of which providers are actually connected, closing the gap between the multi-source backend (complete) and the user-facing experience.

## Guiding principles

1. Use what better-auth already provides (`linkSocialAccount`, account listing) before building custom endpoints.
2. Keep the surface minimal: a sheet or small page, not a full settings redesign.
3. The sync dropdown should never offer actions the user can't complete.
4. Handle the "X not configured" case (missing env vars) gracefully at every layer.

## Scope

- In-scope:
  - Connected accounts UI (link/unlink X)
  - Sync dropdown UX improvements (connect-aware)
  - Server-side feature flag for X availability
  - Client-side account status hooks
- Out-of-scope:
  - Adding X as a sign-in provider
  - New providers beyond YouTube + X
  - Changes to the sync engine or content model

## Workstreams

### ~~WS1 - X availability flag and account status API~~ ✅

#### Deliverables

- ~~Server-side utility that exposes whether X is configured (env vars present).~~
- ~~API route or server action that returns the current user's linked accounts (provider ID, username/email, linked date).~~
- ~~Client-side hook (`useConnectedAccounts`) that fetches and caches this data.~~

#### Proposed modules

- `src/lib/auth/x-availability.ts` - simple boolean check on `env.X_CLIENT_ID` && `env.X_CLIENT_SECRET`.
- `src/app/api/accounts/route.ts` - `GET` returns list of linked accounts for the authenticated user (queries `account` table).
- `src/hooks/use-connected-accounts.tsx` - client hook wrapping the API call with React state.

#### Key decisions

- The availability flag is returned alongside accounts from the `/api/accounts` endpoint, not by exposing env vars.
- Account listing queries the `account` table directly (fields: `providerId`, `accountId`, `createdAt`). No tokens exposed.

#### Acceptance criteria

- ~~Client can determine: (a) is X configured on this instance, (b) does the current user have an X account linked.~~
- ~~When `X_CLIENT_ID` is absent, X-related UI is hidden entirely.~~

### ~~WS2 - Connected accounts UI~~ ✅

#### Deliverables

- ~~Connected accounts sheet/dialog accessible from the dashboard header (e.g., user menu or a settings icon).~~
- ~~Lists all linked providers with status: Google (primary, non-removable), X (connect/disconnect).~~
- ~~Connect X triggers `authClient.linkSocial({ provider: 'twitter', callbackURL: '/dashboard' })`.~~
- ~~Disconnect X triggers account unlinking and refreshes the account list.~~

#### Proposed modules

- `src/components/connected-accounts.tsx` - the sheet/dialog component.
- Integrate into `src/app/dashboard/dashboard-client.tsx` - trigger button in the header.

#### UI spec

- ~~**Google row**: Google icon, user email, "Primary" badge, no disconnect action.~~
- ~~**X row (not linked)**: X/Twitter icon, "Not connected" label, "Connect" button.~~
- ~~**X row (linked)**: X/Twitter icon, `@username` label, "Disconnect" button with confirmation.~~
- ~~**X row (not configured)**: Hidden entirely (env vars absent).~~

#### Acceptance criteria

- ~~User can open the connected accounts sheet from the dashboard.~~
- ~~Clicking "Connect" initiates X OAuth and returns to the dashboard with the account linked.~~
- ~~Clicking "Disconnect" removes the X account row after confirmation.~~
- ~~Google account is always shown and cannot be disconnected.~~

### ~~WS3 - Sync dropdown connect-awareness~~ ✅

#### Deliverables

- ~~The sync dropdown's X section adapts based on whether X is linked.~~
- ~~When X is not linked: X section shows a "Connect X to sync" item that opens the connected accounts sheet (or directly triggers OAuth).~~
- ~~When X is linked: existing behavior (Bookmarks / Likes sync actions).~~
- ~~When X is not configured (env vars absent): X section is hidden entirely.~~

#### Proposed changes

- ~~`src/components/sync-button.tsx` - accept connected-accounts state as a prop or use the hook from WS1.~~
- ~~Conditionally render X menu items based on account status.~~

#### Acceptance criteria

- ~~User with no X account linked sees a helpful prompt instead of sync actions that would fail.~~
- ~~User with X linked sees the existing sync actions unchanged.~~
- ~~Instance without X configured shows no X-related UI anywhere.~~

### WS4 - Error handling and edge cases

#### Deliverables

- Handle OAuth errors during linking (user denied, provider error) with toast notifications.
- Handle "X account already linked to another user" edge case with a clear error message.
- Handle disconnect-while-sync-in-progress gracefully (sync fails with auth error, no crash).
- Handle token expiry post-link: if X token expires and refresh fails, show a "Reconnect X" prompt.

#### Proposed changes

- Error handling in `src/components/connected-accounts.tsx` for link/unlink flows.
- Update sync error handling in `src/components/sync-button.tsx` to detect auth errors and suggest reconnecting.

#### Acceptance criteria

- No unhandled errors in the link/unlink/sync flows.
- User always sees an actionable message when something goes wrong.

## Milestones

1. M1: Account status API and hook working, X availability flag in place.
2. M2: Connected accounts sheet functional (link + unlink).
3. M3: Sync dropdown adapts to connected state.
4. M4: Error handling and edge cases covered.

## Definition of done

- User can link X account from the dashboard and successfully sync X bookmarks/likes end-to-end.
- User can disconnect X account and X sync actions become unavailable.
- Instances without X env vars show no X-related UI.
- No regressions to existing YouTube sync or Google sign-in flows.
