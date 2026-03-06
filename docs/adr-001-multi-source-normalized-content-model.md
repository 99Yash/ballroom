# ADR-001: Multi-Source Normalized Content Model

- Status: Accepted
- Date: 2026-03-06
- Owners: Engineering

## Context

Ballroom currently stores synced data in a YouTube-specific shape (`videos` table with `youtubeId`, `channelName`, etc.).

We need to support additional providers (starting with X likes/bookmarks) while preserving the current product behavior and minimizing migration risk.

Key constraints:

- Existing YouTube routes and UI should continue to work during transition.
- Sync must remain idempotent and safe to retry.
- Schema migration should be additive first for safer rollout.

## Decision

Adopt a normalized, source-agnostic content model by evolving current persistence in phases.

### Phase 1 (additive, compatibility-first)

1. Extend persistence to identify source and collection for each record:
   - `source` (e.g., `youtube`, `x`)
   - `collection` (e.g., `likes`, `bookmarks`)
   - `externalId` (provider-native id)
2. Enforce uniqueness on `(userId, source, collection, externalId)`.
3. Store sync checkpoint/state per `(userId, source, collection)`.
4. Keep existing YouTube APIs and route behavior through compatibility wrappers.

### Phase 2 (internal convergence)

1. Shift reads/writes to generic content service APIs.
2. Deprecate provider-specific field dependencies in app-layer logic.
3. Remove compatibility shims after stability window.

## Why this decision

- Lowest-risk migration path for a live system with existing users.
- Avoids a hard cutover and large one-time backfill freeze.
- Lets us ship X incrementally while proving architecture with YouTube parity first.

## Alternatives considered

### A) New table with immediate dual-write and full backfill

Pros:
- Clean separation from legacy schema.

Cons:
- Higher operational complexity (dual-write correctness + large backfill + drift risk).
- Harder rollback during early rollout.

Decision: Not selected for initial transition.

### B) Keep YouTube-specific model and bolt on X-specific paths

Pros:
- Fast short-term implementation.

Cons:
- Compounds technical debt.
- Duplicated sync/business logic.
- High long-term cost and brittle scalability.

Decision: Rejected.

## Consequences

### Positive

- Reusable sync engine and provider adapters.
- Cleaner API and workflow evolution for future providers.
- Better observability and cost controls per source.

### Negative

- Medium refactor effort before visible X features are complete.
- Temporary complexity due to compatibility layers.

## Implementation notes

- Keep rollout additive and reversible until full cutover.
- Maintain strict idempotency guarantees in upsert path.
- Use source-aware concurrency keys in background workflows.
- Ensure error shape compatibility for existing clients.

## Follow-up ADRs

- ADR-002: Quota model granularity (global sync quota vs source/collection quotas)
- ADR-003: Inactive record retention and default visibility strategy
