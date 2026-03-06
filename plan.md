# Ballroom Multi-Source Implementation Plan

## Objective

Deliver X likes/bookmarks support on top of a scalable, provider-agnostic sync architecture, while preserving current YouTube functionality.

## Guiding principles

1. Refactor for reuse before adding more provider-specific logic.
2. Keep production behavior stable with backward-compatible APIs during migration.
3. Optimize for idempotency, observability, and cost control.
4. Build personal-first UX, platform-ready internals.

## Scope for this plan

- In-scope:
  - Generic sync contracts and engine
  - X provider integration (bookmarks + likes)
  - Normalized data model and query surface
  - Workflow and quota updates
- Out-of-scope:
  - New social providers beyond YouTube + X
  - Prompt/model redesign for AI categorization

## Workstreams

## ~~WS1 - Domain and contracts~~ ✅

### Deliverables

- ~~Provider-agnostic interfaces for:~~
  - ~~`SourceProvider`~~
  - ~~`CollectionType`~~
  - ~~`NormalizedContentItem`~~
  - ~~`SyncCursor` and `SyncPageResult`~~

### Proposed modules

- ~~`src/lib/sources/types.ts`~~
- ~~`src/lib/sources/provider-registry.ts`~~
- ~~`src/lib/sources/normalize.ts`~~

### Acceptance criteria

- ~~Existing YouTube fetch/sync code can be adapted to interfaces with no behavior regression.~~

## WS2 - Data model and storage

### Deliverables

- Normalized content persistence supporting multiple sources and collections.
- Sync state persistence per `(userId, source, collection)`.

### Schema direction

- Introduce a normalized content table (or equivalent evolution of current `videos` table) with fields like:
  - `id`, `userId`, `source`, `collection`, `externalId`
  - `title`, `description/body`, `thumbnailUrl/mediaUrl`
  - `authorName`, `authorId`, `publishedAt`
  - `categoryId`, `lastAnalyzedAt`, `syncStatus`, `lastSeenAt`
  - lifecycle timestamps
- Introduce sync-state table with:
  - `userId`, `source`, `collection`, `cursor`, `lastSyncedAt`, `reachedEnd`, `lastError`

### Indexes

- Unique: `(userId, source, collection, externalId)`
- Filter/query: `(userId, source, categoryId)`, `(userId, source, createdAt)`, `(userId, syncStatus)`
- Search vector index on normalized text fields

### Acceptance criteria

- Upsert path is idempotent and query performance remains acceptable under pagination + search.

## WS3 - Sync engine refactor

### Deliverables

- Extract generic progressive sync loop from current `src/lib/sync.ts`.
- Pluggable fetcher + mapper + reconciliation strategy.

### Proposed modules

- `src/lib/sync/engine.ts`
- `src/lib/sync/reconcile.ts`
- `src/lib/sync/persistence.ts`

### Migration strategy

1. Wrap existing YouTube behavior in new engine first.
2. Keep `/api/youtube/*` routes working as compatibility layer.
3. Add source-aware routes once stable.

### Acceptance criteria

- YouTube quick/extended/full sync parity verified.

## WS4 - X provider integration

### Deliverables

- OAuth provider setup for X with required scopes.
- Source adapter for:
  - `x/bookmarks`
  - `x/likes`
- Error mapping for 401/403/429 and reauth requirements.

### Proposed modules

- `src/lib/x.ts` (low-level client)
- `src/lib/sources/x-provider.ts`
- Auth config updates in `src/lib/auth/server.ts`
- Env validation updates in `src/lib/env.ts`

### Acceptance criteria

- User can connect X account and complete sync for bookmarks and likes.

## WS5 - API surface and UI evolution

### Deliverables

- Unified listing/count endpoints that accept source filters.
- Sync endpoints become source-aware while preserving old YouTube routes.
- Dashboard adds source filtering and clear source labeling.

### Proposed endpoint direction

- New generic endpoints:
  - `GET /api/content`
  - `GET /api/content/counts`
  - `POST /api/sync` with `{ source, collection, mode }`
- Backward-compat wrappers:
  - Existing `/api/youtube/*` routes map to generic service calls.

### UI updates

- `SyncButton` adds source + collection actions.
- Dashboard list and counts support source pills/filters.

### Acceptance criteria

- User can browse mixed-source data without confusion.

## WS6 - Workflows, quotas, and cost controls

### Deliverables

- Source-aware workflow triggers and schedule jobs.
- Quota model evolves from generic `sync` to source/collection granularity.
- Budget and warning thresholds for X usage.

### Workflow updates

- Extend `src/workflows/sync-videos.ts` into source-aware task payloads.
- Concurrency key format: `userId:source:collection`.

### Cost controls

- Configurable max pages per run.
- Deep sync cooldown by source/collection.
- Daily/monthly usage summary logs.

### Acceptance criteria

- No concurrent sync race for same user/source/collection.
- Quota enforcement remains atomic under concurrency.

## WS7 - Testing, observability, and rollout

### Test plan

- Unit tests:
  - Provider normalization
  - Cursor handling
  - Reconciliation rules
- Integration tests:
  - Upsert idempotency
  - Sync state checkpoint updates
  - Quota and error handling
- Manual/e2e smoke:
  - OAuth connect/disconnect
  - Quick sync, extended sync, and rerun behavior

### Observability

- Standard log fields: `userId`, `source`, `collection`, `mode`, `duration`, `status`, `errorCode`.
- Sync-run summaries with inserted/updated/inactivated counts.

### Rollout sequence

1. Feature flag: generic engine + YouTube adapter only.
2. Enable X bookmarks sync for internal use.
3. Enable X likes sync.
4. Enable source-aware scheduled jobs.

## Milestones

1. M1: Contracts + schema finalized.
2. M2: Generic engine + YouTube parity complete.
3. M3: X bookmarks end-to-end working.
4. M4: X likes + unified UI complete.
5. M5: Hardening complete (tests, metrics, docs).

## Definition of done

- YouTube features remain stable with no functional regression.
- X likes/bookmarks sync works end-to-end with retries and clear errors.
- Content model and APIs are source-agnostic.
- Quotas/cost controls and observability are in place.
- Documentation is updated for setup, env vars, and operations.

## Companion execution docs

- Transition checklist: `docs/transition-checklist.md`
- Migration runbook: `docs/multi-source-migration-runbook.md`
- API contract: `docs/api-contract-multi-source-v1.md`
- Architecture decision: `docs/adr-001-multi-source-normalized-content-model.md`
