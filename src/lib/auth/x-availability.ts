import { env } from '~/lib/env';

/** Whether X/Twitter OAuth is configured on this instance. */
export function isXConfigured(): boolean {
  return !!(env.X_CLIENT_ID && env.X_CLIENT_SECRET);
}
