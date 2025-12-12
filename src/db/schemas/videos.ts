import { boolean, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { createId, lifecycle_dates } from './helpers';

export const categories = pgTable('categories', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId('cat')),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  ...lifecycle_dates,
});

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
