import { z } from 'zod';

/**
 * Environment variable schema
 * Validates required env vars are present at runtime
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),

  // Google OAuth & YouTube API
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),

  // OpenAI API
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET is required'),
  BETTER_AUTH_URL: z
    .string()
    .url()
    .min(1, 'BETTER_AUTH_URL is required')
    .optional(),

  // Node Environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

/**
 * Parsed and validated environment variables
 * Call this once at app startup to ensure all required vars are present
 */
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
        .join('\n');

      console.error('❌ Environment variable validation failed:\n' + missingVars);
      throw new Error('Missing or invalid environment variables');
    }
    throw error;
  }
}

/**
 * Validated environment variables
 * Access these instead of process.env directly
 */
export const env = validateEnv();

/**
 * Type-safe environment variables
 */
export type Env = z.infer<typeof envSchema>;

