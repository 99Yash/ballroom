# Multi-Source Migration Runbook

Operational playbook for a low-risk migration from YouTube-only internals to multi-source architecture.

## 1) Preconditions

- PRD and implementation plan are approved.
- ADR and API contract are finalized.
- Rollout feature flags exist and can be toggled quickly.
- Monitoring and alerting are configured.

## 2) Rollout sequence

## Step A - Deploy additive schema changes

Actions:

1. Deploy schema updates that do not break current code paths.
2. Keep current read/write paths untouched.

Validation:

- Existing endpoints keep returning expected responses.
- No increase in DB errors after deployment.

Rollback:

- Revert app deploy only; additive columns/tables can remain safely.

## Step B - Enable generic engine for YouTube only

Actions:

1. Turn on `syncEngineV2Enabled` for internal users.
2. Route YouTube sync through generic engine adapter.

Validation:

- Quick/extended/full YouTube sync parity against baseline.
- No duplicate rows from repeated sync runs.

Rollback:

- Turn off `syncEngineV2Enabled`.

## Step C - Backfill normalized source keys for historical data

Actions:

1. Run backfill for existing YouTube rows (`source=youtube`, `collection=likes`, `externalId=youtubeId`).
2. Verify idempotent rerun safety.

Validation:

- Count parity before vs after backfill.
- Null source/collection counts trend to zero.

Rollback:

- Backfill should be retryable and non-destructive; no rollback required if additive.

## Step D - Enable new content APIs behind flag

Actions:

1. Enable `contentApiV2Enabled` for internal users.
2. Keep legacy endpoints as wrappers.

Validation:

- Dashboard parity tests pass for YouTube-only accounts.
- Search and pagination behavior match expected results.

Rollback:

- Turn off `contentApiV2Enabled`.

## Step E - Enable X bookmarks

Actions:

1. Enable OAuth provider and scopes for X.
2. Enable `xBookmarksEnabled`.
3. Keep X likes disabled initially.

Validation:

- Connect X account, sync bookmarks, verify counts and details.
- Reauth path works for token expiration/revocation.

Rollback:

- Turn off `xBookmarksEnabled`.
- Keep existing YouTube paths untouched.

## Step F - Enable X likes

Actions:

1. Enable `xLikesEnabled`.
2. Monitor API usage/cost closely in first window.

Validation:

- Sync quality and cost remain within expected ranges.

Rollback:

- Turn off `xLikesEnabled`.

## Step G - Enable source-aware schedules

Actions:

1. Enable `sourceAwareSchedulesEnabled`.
2. Stagger schedule rollout if needed (bookmarks first, likes later).

Validation:

- Scheduled runs complete with expected success rate.
- No concurrency collisions for same user/source/collection.

Rollback:

- Disable source-aware schedules and fall back to previous scheduled path.

## 3) Monitoring during rollout

Track at minimum:

- Sync success/failure rate by source and collection
- p95 sync duration by source and collection
- Auth error rate (`UNAUTHORIZED`, reauth-required)
- Rate-limit and quota errors (`TOO_MANY_REQUESTS`, `QUOTA_EXCEEDED`)
- Duplicate key violations / unexpected conflict spikes

Alert thresholds (example):

- Sync failure rate > 5% for 15 minutes
- 5xx rate > baseline + 2x
- Rate-limit errors > 10% of sync attempts

## 4) Rollback policy

Fast rollback order:

1. Disable newest feature flag first (X likes, then X bookmarks, then V2 API, then V2 engine).
2. Pause schedule triggers if failures are systemic.
3. Keep additive schema intact; avoid destructive rollback under incident pressure.

## 5) Post-rollout hardening

- Keep wrappers for at least one stable release cycle.
- Run data consistency checks daily for first week.
- Document incident learnings and update this runbook.
- Plan and execute legacy code cleanup only after stability window.
