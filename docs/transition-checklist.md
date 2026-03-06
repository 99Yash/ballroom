# Multi-Source Transition Checklist

Use this checklist to ship the YouTube -> multi-source (YouTube + X) transition with minimal risk.

## Release goals

- No user-facing downtime
- No data loss
- No duplicate content rows
- Existing YouTube flows remain intact while X is introduced

## Gate 0 - Baseline and readiness

- [ ] `prd.md` approved by product and engineering
- [ ] `plan.md` approved by engineering
- [ ] ADR for data model finalized (`docs/adr-001-multi-source-normalized-content-model.md`)
- [ ] API contract finalized (`docs/api-contract-multi-source-v1.md`)
- [ ] Feature flags defined:
  - [ ] `syncEngineV2Enabled`
  - [ ] `contentApiV2Enabled`
  - [ ] `xBookmarksEnabled`
  - [ ] `xLikesEnabled`
  - [ ] `sourceAwareSchedulesEnabled`

Exit criteria:
- Team agrees on migration sequence and rollback steps.

## Gate 1 - Contracts and architecture

- [ ] Provider-agnostic source types exist (`source`, `collection`, `cursor`, normalized item)
- [ ] Provider registry pattern implemented for YouTube and X adapters
- [ ] Generic sync engine extracted from current YouTube-only logic
- [ ] Reconciliation behavior documented (when to mark inactive)

Exit criteria:
- YouTube adapter runs through generic engine with parity in local/dev.

## Gate 2 - Schema and persistence

- [ ] Additive schema changes only in initial rollout
- [ ] Unique key guarantees idempotency (`userId + source + collection + externalId`)
- [ ] Sync state table (or equivalent) stores cursor/checkpoint per user/source/collection
- [ ] Search indexes updated for normalized fields
- [ ] Backfill script prepared for existing YouTube rows (`source=youtube`, `collection=likes`)

Exit criteria:
- Existing reads/writes keep working with new columns/tables present.

## Gate 3 - API compatibility and UI stability

- [ ] New source-aware APIs implemented (`/api/content`, `/api/content/counts`, `/api/sync`)
- [ ] Legacy YouTube endpoints remain functional as compatibility wrappers
- [ ] Dashboard supports source filtering without breaking current default behavior
- [ ] Sync button supports source + collection actions
- [ ] Error responses remain backward compatible (`error` string still present)

Exit criteria:
- Existing users can use app exactly as before with YouTube-only account.

## Gate 4 - Workflow, quota, and cost controls

- [ ] Trigger payloads are source-aware
- [ ] Concurrency key includes user + source + collection
- [ ] Quota checks are atomic under concurrent sync triggers
- [ ] Source-level cost controls in place:
  - [ ] page/run caps
  - [ ] full-sync cooldowns
  - [ ] warning thresholds

Exit criteria:
- No race-condition regressions in sync status transitions.

## Gate 5 - X OAuth and provider rollout

- [ ] X OAuth provider configured with minimal scopes
- [ ] X token refresh and auth error mapping implemented
- [ ] X bookmarks sync end-to-end tested
- [ ] X likes sync end-to-end tested
- [ ] Reauth UX path verified for expired/revoked tokens

Exit criteria:
- A user can connect X and sync both bookmarks and likes reliably.

## Gate 6 - Quality and reliability verification

- [ ] Lint and build pass (`pnpm lint`, `pnpm build`)
- [ ] Unit tests cover normalization, cursor handling, and reconciliation
- [ ] Integration tests cover upsert idempotency + sync-state updates
- [ ] Manual smoke tests completed:
  - [ ] Sign in with Google only
  - [ ] Sign in with Google + X
  - [ ] Quick/extended/full sync
  - [ ] Search/filter/pagination across mixed sources
  - [ ] Categorization with mixed sources
- [ ] Observability dashboards/alerts ready:
  - [ ] sync success rate
  - [ ] sync duration p95
  - [ ] auth failure rates
  - [ ] duplicate row anomaly checks

Exit criteria:
- Error budgets and key acceptance checks are green.

## Gate 7 - Production rollout and post-launch

- [ ] Rollout sequence followed:
  - [ ] Enable generic engine for YouTube only
  - [ ] Enable content API V2
  - [ ] Enable X bookmarks
  - [ ] Enable X likes
  - [ ] Enable source-aware schedules
- [ ] Post-launch monitoring window active (24-72h)
- [ ] Migration cleanup tasks scheduled (remove legacy code once stable)

Exit criteria:
- Stable metrics for at least one full schedule cycle and successful rollback drill.

## Seamless transition acceptance checks

- [ ] No spike in 5xx rates after each rollout step
- [ ] No unexpected drop in content counts for existing YouTube users
- [ ] Duplicate content row rate remains below threshold
- [ ] Reauth errors are actionable and recoverable
- [ ] Cost alerts trigger before hard limits are hit
