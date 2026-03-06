# API Contract: Multi-Source Content and Sync (v1)

This document defines the target source-aware API contract while preserving compatibility with existing YouTube routes.

## Principles

- Keep responses backward compatible where feasible.
- Normalize common fields across sources.
- Keep provider-specific metadata optional and namespaced.

## 1) `POST /api/sync`

Trigger a sync for a source + collection.

### Request body

```json
{
  "source": "youtube",
  "collection": "likes",
  "mode": "quick"
}
```

### Validation

- `source`: `youtube` | `x`
- `collection`: `likes` | `bookmarks`
- `mode`: `quick` | `extended` | `full`

### Source/collection matrix

- `youtube/likes`: allowed
- `youtube/bookmarks`: not supported
- `x/likes`: allowed
- `x/bookmarks`: allowed

### Success response (quick/extended)

```json
{
  "source": "youtube",
  "collection": "likes",
  "mode": "quick",
  "synced": 50,
  "new": 6,
  "existing": 44,
  "inactive": 0,
  "reachedEnd": false,
  "message": "Synced 6 new items",
  "quota": {
    "sync": {
      "used": 100,
      "limit": 5000,
      "remaining": 4900,
      "percentageUsed": 2,
      "resetAt": "2026-04-01T00:00:00.000Z"
    },
    "categorize": {
      "used": 12,
      "limit": 500,
      "remaining": 488,
      "percentageUsed": 2.4,
      "resetAt": "2026-04-01T00:00:00.000Z"
    }
  }
}
```

### Success response (full)

```json
{
  "source": "youtube",
  "collection": "likes",
  "mode": "full",
  "queued": true,
  "runId": "run_123",
  "message": "Full sync started in background"
}
```

### Error response

```json
{
  "error": "Quota exceeded. Resets monthly.",
  "code": "QUOTA_EXCEEDED",
  "retryable": false
}
```

## 2) `GET /api/content`

Get paginated content across one or more sources.

### Query params

- `source` (optional): `youtube` | `x`
- `collection` (optional): `likes` | `bookmarks`
- `categoryId` (optional)
- `uncategorized` (optional): `true` | `false`
- `search` (optional): full-text query
- `page` (optional, default `1`)
- `limit` (optional, default `50`, max `100`)

### Success response

```json
{
  "items": [
    {
      "id": "cnt_abc",
      "source": "x",
      "collection": "bookmarks",
      "externalId": "189876543210",
      "title": "Thread: Building resilient APIs",
      "description": "...",
      "thumbnailUrl": null,
      "authorName": "@example",
      "authorId": "2244994945",
      "publishedAt": "2026-02-28T10:01:20.000Z",
      "categoryId": "cat_xyz",
      "categoryName": "Tech",
      "syncStatus": "active",
      "provider": {
        "youtube": null,
        "x": {
          "conversationId": "189876543210",
          "lang": "en"
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalCount": 230,
    "totalPages": 5
  }
}
```

Notes:

- `provider.*` fields are optional and source-specific.
- Client should not assume all fields are non-null across providers.

## 3) `GET /api/content/counts`

Get aggregate counts for filters and UI chips.

### Query params

- `source` (optional)
- `collection` (optional)

### Success response

```json
{
  "total": 230,
  "uncategorized": 15,
  "byCategory": {
    "cat_tech": 80,
    "cat_music": 25
  },
  "bySource": {
    "youtube": 120,
    "x": 110
  },
  "bySourceCollection": {
    "youtube:likes": 120,
    "x:likes": 45,
    "x:bookmarks": 65
  }
}
```

## 4) `GET /api/sync-status`

Return latest sync status summary.

### Query params

- `source` (optional)
- `collection` (optional)

### Success response

```json
{
  "lastSyncAt": "2026-03-06T02:00:00.000Z",
  "totals": {
    "active": 230,
    "inactive": 14
  },
  "bySourceCollection": {
    "youtube:likes": {
      "lastSyncAt": "2026-03-06T02:00:00.000Z",
      "active": 120,
      "inactive": 5,
      "reachedEnd": false
    },
    "x:bookmarks": {
      "lastSyncAt": "2026-03-06T01:20:00.000Z",
      "active": 65,
      "inactive": 0,
      "reachedEnd": true
    }
  }
}
```

## 5) Compatibility mapping

Legacy endpoints should remain available during migration:

- `GET /api/youtube/videos` -> wrapper to `GET /api/content?source=youtube&collection=likes`
- `GET /api/youtube/videos/counts` -> wrapper to `GET /api/content/counts?source=youtube&collection=likes`
- `POST /api/youtube/sync` -> wrapper to `POST /api/sync` (`source=youtube`, `collection=likes`)

Compatibility requirements:

- Keep existing keys (`videos`, `synced`, `new`, etc.) for old clients while wrappers exist.
- New fields may be added, but legacy keys must not disappear until wrapper removal.

## 6) Error code guide

- `BAD_REQUEST` (400): invalid source/collection/mode/params
- `UNAUTHORIZED` (401): auth missing or token invalid
- `FORBIDDEN` (403): unsupported source/collection combination
- `NOT_FOUND` (404): resource not found
- `CONFLICT` (409): conflicting operation state
- `TOO_MANY_REQUESTS` (429): provider rate limit hit
- `QUOTA_EXCEEDED` (429): app/user quota exceeded
- `INTERNAL_SERVER_ERROR` (500): unexpected server error

## 7) Versioning and rollout

- Treat this contract as `v1` of multi-source API.
- Use feature flags for progressive rollout.
- Remove wrappers only after at least one stable release cycle.
