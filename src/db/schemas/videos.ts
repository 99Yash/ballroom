import { sql } from 'drizzle-orm';
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
    // Subcategory support: parent category reference (self-referencing FK)
    parentCategoryId: text('parent_category_id').references(
      (): AnyPgColumn => categories.id,
      { onDelete: 'cascade' }
    ),
    // YouTube playlist export tracking
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
    // GIN index for full-text search on title, description, and channel_name
    // Uses weighted search: title (A), description (B), channel_name (C)
    // Uses 'simple' config for YouTube-style text (mixed languages, code words, brand names)
    index('idx_videos_search_vector').using(
      'gin',
      sql`(
        setweight(to_tsvector('simple', COALESCE(${table.title}, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(${table.description}, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(${table.channelName}, '')), 'C')
      )`
    ),
  ]
);

// Default categories to seed for new users
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

// Inferred types from Drizzle schemas
export type DatabaseVideo = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

export type DatabaseCategory = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
