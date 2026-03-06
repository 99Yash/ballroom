/**
 * Provider-agnostic source types for multi-source content sync.
 *
 * These contracts define the interface between the generic sync engine
 * and provider-specific adapters (YouTube, X, etc.).
 */

// ---------------------------------------------------------------------------
// Source & collection enums
// ---------------------------------------------------------------------------

export const CONTENT_SOURCES = ['youtube', 'x'] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const COLLECTION_TYPES = ['likes', 'bookmarks'] as const;
export type CollectionType = (typeof COLLECTION_TYPES)[number];

export const SYNC_MODES = ['quick', 'extended', 'full'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

/** Valid source+collection combinations. YouTube only supports likes. */
export const VALID_SOURCE_COLLECTIONS: ReadonlyArray<{
  source: ContentSource;
  collection: CollectionType;
}> = [
  { source: 'youtube', collection: 'likes' },
  { source: 'x', collection: 'likes' },
  { source: 'x', collection: 'bookmarks' },
] as const;

export function isValidSourceCollection(
  source: ContentSource,
  collection: CollectionType
): boolean {
  return VALID_SOURCE_COLLECTIONS.some(
    (sc) => sc.source === source && sc.collection === collection
  );
}

// ---------------------------------------------------------------------------
// Normalized content item
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic representation of a content item.
 * This is the shape produced by provider adapters and consumed by the sync engine.
 */
export interface NormalizedContentItem {
  /** Provider-native ID (e.g. YouTube video ID, tweet ID). */
  externalId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorId: string | null;
  publishedAt: Date | null;
  /** Optional provider-specific metadata blob (stored as JSON). */
  providerMetadata?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Sync cursor & pagination
// ---------------------------------------------------------------------------

/**
 * Opaque cursor that provider adapters use to track pagination state.
 * Each provider stores whatever it needs (page token, tweet ID, etc.).
 */
export interface SyncCursor {
  /** Provider-specific token for fetching the next page. */
  token: string | null;
  /** Whether a previous sync run reached the end of the collection. */
  reachedEnd: boolean;
}

export const EMPTY_CURSOR: SyncCursor = {
  token: null,
  reachedEnd: false,
} as const;

/**
 * Result of fetching a single page from a provider.
 */
export interface SyncPageResult {
  items: NormalizedContentItem[];
  /** Cursor for fetching the next page. `null` token means no more pages. */
  nextCursor: SyncCursor;
}

// ---------------------------------------------------------------------------
// Sync result (engine output)
// ---------------------------------------------------------------------------

export interface SyncResult {
  source: ContentSource;
  collection: CollectionType;
  mode: SyncMode;
  synced: number;
  new: number;
  existing: number;
  inactive: number;
  reachedEnd: boolean;
}

// ---------------------------------------------------------------------------
// Source provider interface
// ---------------------------------------------------------------------------

/**
 * Contract that every content-source adapter must implement.
 *
 * The sync engine calls `fetchPage` in a loop, passing the cursor from the
 * previous call, until it decides to stop (based on mode limits, consecutive-
 * existing heuristics, or reaching end-of-collection).
 */
export interface SourceProvider {
  readonly source: ContentSource;
  readonly supportedCollections: ReadonlyArray<CollectionType>;

  /**
   * Fetch a single page of items from the provider.
   *
   * @param userId    - Internal user ID (used to look up OAuth tokens).
   * @param collection - Which collection to fetch (likes, bookmarks, etc.).
   * @param pageSize  - Maximum items to return per page.
   * @param cursor    - Pagination cursor from the previous call (or EMPTY_CURSOR).
   * @returns A page of normalized items and the cursor for the next page.
   */
  fetchPage(
    userId: string,
    collection: CollectionType,
    pageSize: number,
    cursor: SyncCursor
  ): Promise<SyncPageResult>;
}
