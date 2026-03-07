# Connected Accounts PRD

## Document status

- Owner: Product + Engineering
- Status: Draft for implementation
- Last updated: 2026-03-06

## 1) Background and problem

The multi-source sync backend (WS1-WS7) is complete: Better Auth registers Twitter as a social provider, the X API client handles token refresh and pagination, the sync engine normalizes tweets alongside YouTube videos, and the dashboard UI has source filters and X sync actions in the dropdown.

However, there is no user-facing path to actually link an X account. The sign-in page only offers Google, there is no settings or account-management page, and clicking "Sync X Bookmarks" in the dropdown fails with "No X account linked." The backend plumbing is ready but inaccessible.

## 2) Vision

Users can connect and disconnect social accounts from a single settings surface, with the sync UI gracefully adapting to which providers are actually linked.

## 3) Goals

1. Let authenticated users link their X account via OAuth without disrupting their existing Google-based identity.
2. Let users disconnect a linked X account.
3. Surface connected-account status so users understand what's linked before attempting a sync.
4. Make the sync dropdown contextually aware: guide users to connect X before showing X sync actions.

## 4) Non-goals

- Adding X as a primary sign-in method (Google remains the sole identity provider).
- Building a general-purpose settings page beyond connected accounts.
- Changing the sync engine, content model, or API surface from WS1-WS7.
- Supporting additional providers beyond YouTube + X in this phase.

## 5) Target users

- Existing Ballroom users who signed in with Google and want to also sync X content.

## 6) Core user jobs

1. "Connect my X account so I can sync my bookmarks and likes."
2. "See which accounts are connected at a glance."
3. "Disconnect X if I no longer want to sync from it."
4. "Understand why X sync isn't available and how to fix it."

## 7) Product requirements

### 7.1 Functional requirements

- FR-1: Authenticated user can navigate to a connected-accounts surface from the dashboard.
- FR-2: User can initiate X OAuth linking via better-auth's `linkSocialAccount` flow.
- FR-3: After successful linking, the X account appears as connected with the linked username.
- FR-4: User can disconnect a linked X account.
- FR-5: The sync dropdown adapts based on connected accounts: X sync actions are disabled or replaced with a "Connect X" prompt when no X account is linked.
- FR-6: Connected-accounts state is queryable client-side without additional API routes (uses better-auth's session/account APIs).

### 7.2 UX requirements

- UX-1: The connected-accounts surface should be lightweight (sheet/dialog or minimal page), not a full settings overhaul.
- UX-2: Connected status should be visible at a glance: provider icon, linked username/email, and a disconnect action.
- UX-3: The connect flow should use a popup or redirect that returns the user to the same page.
- UX-4: Error states are actionable: OAuth denied, token expired, provider not configured (missing env vars).
- UX-5: Google account row is shown as the primary identity (non-disconnectable).

### 7.3 Security requirements

- SEC-1: Only the authenticated user can link/unlink their own accounts.
- SEC-2: OAuth tokens remain server-side only; client never sees access/refresh tokens.
- SEC-3: Disconnect revokes stored tokens and removes the account row.

## 8) Success metrics

- Users who attempt X sync have a linked X account (zero "No X account linked" errors in production).
- Link/unlink flow completes without errors >= 95% of attempts.
- Time from "Connect X" click to linked account < 30 seconds (OAuth round-trip).

## 9) Risks and mitigations

- Risk: Better-auth's `linkSocialAccount` may behave differently from `signIn.social` for edge cases (e.g., X account already linked to another user).
  - Mitigation: Test edge cases explicitly; surface clear error messages.
- Risk: X OAuth app not configured (missing `X_CLIENT_ID` / `X_CLIENT_SECRET`).
  - Mitigation: Hide X connect option entirely when env vars are absent; expose a server-side flag.
- Risk: Users disconnect X while a sync is in progress.
  - Mitigation: Sync engine already handles missing credentials gracefully with `AuthenticationError`.

## 10) Dependencies

- Better Auth's built-in `linkSocialAccount` endpoint (`POST /api/auth/link-social`).
- `X_CLIENT_ID` and `X_CLIENT_SECRET` environment variables configured.
- Twitter provider registered in `src/lib/auth/server.ts` (already done, conditional on env vars).
