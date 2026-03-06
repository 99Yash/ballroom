import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '~/db';
import * as schema from '~/db/schemas';
import { env } from '~/lib/env';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/youtube.readonly',
      ],
      accessType: 'offline',
      prompt: 'consent',
    },
    ...(env.X_CLIENT_ID && env.X_CLIENT_SECRET
      ? {
          twitter: {
            clientId: env.X_CLIENT_ID,
            clientSecret: env.X_CLIENT_SECRET,
            scope: [
              'tweet.read',
              'users.read',
              'bookmark.read',
              'like.read',
              'offline.access',
            ],
          },
        }
      : {}),
  },
});
