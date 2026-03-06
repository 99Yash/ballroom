# Ballroom Multi-Source Sync PRD

## Document status

- Owner: Product + Engineering
- Status: Draft for implementation
- Last updated: 2026-03-06

## 1) Background and problem

Ballroom currently helps users organize YouTube liked videos with AI categorization.

We now want to expand Ballroom to support X (Twitter) likes and bookmarks while keeping the codebase clean, reusable, and scalable. Even if initial usage is personal, the system should be designed to support multiple users, multiple providers, and larger data volumes without major rewrites.

## 2) Vision

Ballroom becomes a unified "saved content organizer" where users sync engagement signals (likes, bookmarks, saved items) from different platforms and organize them with categories + AI.

## 3) Goals

1. Add X support for:
   - Bookmarks
   - Likes
2. Keep YouTube behavior intact while refactoring toward a provider-agnostic architecture.
3. Control API cost and rate-limit risk with strong sync and quota strategy.
4. Preserve data quality (idempotent sync, no duplicate items, stable category behavior).

## 4) Non-goals

- Posting or mutating content on X/YouTube.
- Rebuilding existing category UI from scratch.
- Introducing team/multi-org features in this phase.
- Replacing AI categorization model/prompt strategy in this phase.

## 5) Target users

- Primary: single-user/personal account owner (near-term).
- Secondary: future multi-user app users.

## 6) Core user jobs

1. "Sync my saved content from YouTube and X."
2. "View all saved content in one place, filter by source and category."
3. "Use AI to categorize new content quickly."
4. "Understand sync status and avoid unexpected API cost."

## 7) Product requirements

### 7.1 Functional requirements

- FR-1: Support multiple content providers under one user account.
- FR-2: User can connect provider accounts (Google/YouTube and X) via OAuth.
- FR-3: User can run sync for a given provider + collection type (e.g., `x/bookmarks`, `x/likes`, `youtube/likes`).
- FR-4: Sync supports quick, extended, and full modes, using cursors/checkpoints where available.
- FR-5: Sync is idempotent and safe to retry.
- FR-6: Existing records update when metadata changes; new records insert without duplicates.
- FR-7: Items no longer present in source can be marked inactive via reconciliation policy.
- FR-8: Content list API supports filtering by source, category, uncategorized, search, and pagination.
- FR-9: AI categorization works on a normalized content model (not provider-specific model).
- FR-10: Sync status and quota/cost indicators are visible and understandable.

### 7.2 Data and domain requirements

- DR-1: Introduce normalized content entity that is provider-agnostic.
- DR-2: Enforce unique key per user/source/collection/external item.
- DR-3: Store sync state per user/source/collection (cursor, last run, reached end, errors).
- DR-4: Preserve category assignments across re-syncs when source item remains active.

### 7.3 Reliability and scalability requirements

- NFR-1: Per-user, per-source sync serialization to prevent race conditions.
- NFR-2: No unbounded database queries in sync or listing paths.
- NFR-3: Batch-oriented upserts for throughput and lower DB/API cost.
- NFR-4: Sync jobs are resumable/retry-safe.
- NFR-5: API and workflow logs include provider, collection, user, duration, status.

### 7.4 Security and compliance requirements

- SEC-1: OAuth tokens are stored server-side only.
- SEC-2: Minimal scope request per provider (principle of least privilege).
- SEC-3: No provider access tokens exposed to client responses.

### 7.5 Cost and rate-limit requirements

- COST-1: Respect provider rate limits with bounded page sizes and backoff.
- COST-2: Expose spending/usage guardrails (monthly cap + warnings).
- COST-3: Prioritize incremental sync over repeated deep/full scans.

## 8) UX requirements

- UX-1: Keep current dashboard flow familiar.
- UX-2: Add source context (icon/badge/filter) without clutter.
- UX-3: Sync actions remain simple (quick, extended, full where appropriate).
- UX-4: Error states are actionable (reauth, rate-limited, quota exceeded).

## 9) Success metrics

- Sync success rate >= 98% for scheduled incremental runs.
- Duplicate normalized content rows: near zero (target < 0.1%).
- p95 sync API response time for trigger endpoints: < 1s (async handoff).
- User-visible sync failures that require manual intervention: low and decreasing.
- Cost predictability: budget threshold alerts fire before hard cap.

## 10) Risks and mitigations

- Risk: X API pricing/rate changes.
  - Mitigation: configurable budget caps, feature flags, source-level throttles.
- Risk: Schema migration complexity from YouTube-specific model.
  - Mitigation: staged migration with compatibility layer.
- Risk: Token expiry/reauth friction.
  - Mitigation: explicit auth error taxonomy + UI prompts.
- Risk: False inactive marking on partial sync.
  - Mitigation: only reconcile in trustworthy end-of-list/full conditions.

## 11) Dependencies

- X Developer account and OAuth app setup.
- X API billing credits and usage monitoring.
- Existing Better Auth + Drizzle + Trigger.dev stack.

## 12) Rollout strategy

1. Internal migration: generic sync engine + YouTube adapter parity.
2. Private beta: X bookmarks only.
3. Add X likes.
4. Enable unified source filters and scheduling controls.

## 13) Open questions

- Should X likes and X bookmarks have separate sync quotas, or one shared X quota bucket?
- Should inactive items remain visible by default or be hidden unless filtered?
- Should source-specific metadata (e.g., repost count) be searchable in v1?

## 14) Companion docs

- Architecture decision: `docs/adr-001-multi-source-normalized-content-model.md`
- API contract: `docs/api-contract-multi-source-v1.md`
- Migration runbook: `docs/multi-source-migration-runbook.md`
- Transition checklist: `docs/transition-checklist.md`
