import { nextCookies } from 'better-auth/next-js';
import { createAuthClient } from 'better-auth/react';
import { env } from '~/lib/env';

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [nextCookies()],
});
