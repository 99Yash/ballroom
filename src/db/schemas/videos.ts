import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { createId, lifecycle_dates } from './helpers';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const contentSourceEnum = pgEnum('content_source', ['youtube', 'x']);
export const collectionTypeEnum = pgEnum('collection_type', [
  'likes',
  'bookmarks',
]);

export const videoSyncStatusEnum = pgEnum('video_sync_status', [
  'active',
  'unliked',
]);

export type VideoSyncStatus = 'active' | 'unliked';

export const VIDEO_SYNC_STATUS = {
  ACTIVE: 'active',
  UNLIKED: 'unliked',
} as const satisfies Record<string, VideoSyncStatus>;

/**
 * Creates a weighted full-text search vector expression for video search.
 * Uses PostgreSQL tsvector with weighted fields:
 * - title: weight 'A' (highest priority)
 * - description: weight 'B' (medium priority)
 * - channelName: weight 'C' (lowest priority)
 *
 * Uses 'simple' text search config for YouTube-style text (mixed languages, code words, brand names).
 *
 * @param title - Title column reference
 * @param description - Description column reference (column may be nullable in the database)
 * @param channelName - Channel name column reference (column may be nullable in the database)
 * @returns SQL expression for the search vector
 */
export function createVideoSearchVector(
  title: AnyPgColumn,
  description: AnyPgColumn,
  channelName: AnyPgColumn
): SQL {
  return sql`(
    setweight(to_tsvector('simple', COALESCE(${title}, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(${description}, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(${channelName}, '')), 'C')
  )`;
}

export const categories = pgTable(
  'categories',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('cat')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    parentCategoryId: text('parent_category_id').references(
      (): AnyPgColumn => categories.id,
      { onDelete: 'cascade' }
    ),
    youtubePlaylistId: text('youtube_playlist_id'),
    lastSyncedAt: timestamp('last_synced_at'),
    ...lifecycle_dates,
  },
  (table) => [
    index('idx_categories_user_id').on(table.userId),
    index('idx_categories_parent_id').on(table.parentCategoryId),
  ]
);

export const videos = pgTable(
  'videos',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('vid')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    youtubeId: text('youtube_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    thumbnailUrl: text('thumbnail_url'),
    channelName: text('channel_name'),
    channelId: text('channel_id'),
    publishedAt: timestamp('published_at'),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    lastAnalyzedAt: timestamp('last_analyzed_at'),
    syncStatus: videoSyncStatusEnum('sync_status').default('active').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    // Multi-source fields (WS2 additive)
    source: contentSourceEnum('source').default('youtube').notNull(),
    collection: collectionTypeEnum('collection').default('likes').notNull(),
    externalId: text('external_id').notNull(),
    providerMetadata: jsonb('provider_metadata'),
    youtubePlaylistItemId: text('youtube_playlist_item_id'),
    ...lifecycle_dates,
  },
  (table) => [
    unique('videos_user_youtube_unique').on(table.userId, table.youtubeId),
    unique('videos_user_source_collection_external_id').on(
      table.userId,
      table.source,
      table.collection,
      table.externalId
    ),
    index('idx_videos_user_id').on(table.userId),
    index('idx_videos_category_id').on(table.categoryId),
    index('idx_videos_youtube_id').on(table.youtubeId),
    index('idx_videos_user_id_created_at').on(table.userId, table.createdAt),
    index('idx_videos_user_id_category_id').on(table.userId, table.categoryId),
    index('idx_videos_sync_status').on(table.syncStatus),
    index('idx_videos_user_sync_status').on(table.userId, table.syncStatus),
    index('idx_videos_last_seen_at').on(table.lastSeenAt),
    index('idx_videos_search_vector').using(
      'gin',
      createVideoSearchVector(table.title, table.description, table.channelName)
    ),
    // Multi-source indexes (WS2)
    index('idx_videos_user_source').on(table.userId, table.source),
    index('idx_videos_user_source_category').on(
      table.userId,
      table.source,
      table.categoryId
    ),
    index('idx_videos_user_source_created_at').on(
      table.userId,
      table.source,
      table.createdAt
    ),
  ]
);

export const DEFAULT_CATEGORIES = [
  'Music',
  'Gaming',
  'Tech',
  'Education',
  'Entertainment',
  'News',
  'Sports',
  'Cooking',
  'Travel',
  'Science',
  'Comedy',
  'DIY/Crafts',
  'Fitness',
  'Other',
] as const;

// ---------------------------------------------------------------------------
// Sync state table – tracks cursor/checkpoint per (userId, source, collection)
// ---------------------------------------------------------------------------

export const syncState = pgTable(
  'sync_state',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('ss')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: contentSourceEnum('source').notNull(),
    collection: collectionTypeEnum('collection').notNull(),
    cursor: text('cursor'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    reachedEnd: boolean('reached_end').default(false).notNull(),
    lastError: text('last_error'),
    lastFullSyncAt: timestamp('last_full_sync_at', { withTimezone: true }),
    ...lifecycle_dates,
  },
  (table) => [
    unique('sync_state_user_source_collection').on(
      table.userId,
      table.source,
      table.collection
    ),
    index('idx_sync_state_user_id').on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DatabaseVideo = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

export type DatabaseCategory = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type DatabaseSyncState = typeof syncState.$inferSelect;
export type NewSyncState = typeof syncState.$inferInsert;

/**
 * Reusable select object for Category queries.
 * Matches the client-safe Category type (excludes userId and date fields).
 * Drizzle will automatically infer the correct type from this select object,
 * eliminating the need for type assertions.
 */
export const categorySelect = {
  id: categories.id,
  name: categories.name,
  isDefault: categories.isDefault,
  parentCategoryId: categories.parentCategoryId,
} as const;
