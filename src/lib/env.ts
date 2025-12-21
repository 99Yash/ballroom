import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod/v4';

/**
 * Environment variable schema using T3 Env
 * Validates required env vars are present at runtime and build time
 */
export const env = createEnv({
  server: {
    // Database
    DATABASE_URL: z.string().url(),

    // Google OAuth & YouTube API
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    // Google Generative AI API
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),

    // Better Auth
    BETTER_AUTH_SECRET: z.string().min(1),

    // Trigger.dev
    TRIGGER_SECRET_KEY: z.string().min(1),

    // Node Environment
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
  },
  // For Next.js 16+, we can use experimental__runtimeEnv for automatic handling
  experimental__runtimeEnv: process.env,
});
