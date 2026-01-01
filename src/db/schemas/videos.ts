import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { createId, lifecycle_dates } from './helpers';

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
    ...lifecycle_dates,
  },
  (table) => [
    unique('videos_user_youtube_unique').on(table.userId, table.youtubeId),
    index('idx_videos_user_id').on(table.userId),
    index('idx_videos_category_id').on(table.categoryId),
    index('idx_videos_youtube_id').on(table.youtubeId),
    // GIN index for full-text search: weighted search (title A, description B, channel_name C)
    index('idx_videos_search_vector').using(
      'gin',
      createVideoSearchVector(table.title, table.description, table.channelName)
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

export type DatabaseVideo = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

export type DatabaseCategory = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

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
