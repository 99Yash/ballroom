import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { lifecycle_dates } from './helpers';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  onboardedAt: timestamp('onboarded_at'), // null = not onboarded yet
  ...lifecycle_dates,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...lifecycle_dates,
  },
  (table) => [index('idx_session_user_id').on(table.userId)]
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    ...lifecycle_dates,
  },
  (table) => [index('idx_account_user_id').on(table.userId)]
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ...lifecycle_dates,
});

// Inferred types from Drizzle schemas
export type DatabaseUser = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type DatabaseSession = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export type DatabaseAccount = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export type DatabaseVerification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
