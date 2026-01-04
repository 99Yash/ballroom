import * as z from 'zod/v4';
import { Google } from '~/components/ui/icons/google';

export const authOptionsSchema = z.enum(['GOOGLE']);
export type AuthOptionsType = z.infer<typeof authOptionsSchema>;

export const LOCAL_STORAGE_SCHEMAS = {
  LAST_AUTH_METHOD: authOptionsSchema,
} as const;

export type LocalStorageKey = keyof typeof LOCAL_STORAGE_SCHEMAS;

export type LocalStorageValue<K extends LocalStorageKey> = z.infer<
  (typeof LOCAL_STORAGE_SCHEMAS)[K] & z.ZodTypeAny
>;

interface OAuthProvider {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export const OAUTH_PROVIDERS: Record<'google', OAuthProvider> = {
  google: {
    id: 'google',
    name: 'Google',
    icon: Google,
  },
} as const;

export type OAuthProviderId = keyof typeof OAUTH_PROVIDERS;

export const getProviderById = (
  id: OAuthProviderId
): OAuthProvider | undefined => {
  return OAUTH_PROVIDERS[id];
};

export const APP_CONFIG = {
  youtube: {
    defaultSyncLimit: 100,
    maxSyncLimit: 500,
    apiPageSize: 50,
  },
  ai: {
    batchSize: 10,
    maxRetries: 3,
  },
  sync: {
    progressiveMaxDepth: 10_000,
    quickSyncLimit: 50,
    extendedSyncLimit: 500,
    batchSize: 50,
    lastSeenAtUpdateThresholdMs: 60 * 60 * 1000, // 1 hour
  },
  quota: {
    sync: {
      freeLimit: 5_000,
      paidLimit: 50_000,
    },
    categorize: {
      freeLimit: 500,
      paidLimit: 5_000,
    },
    resetDayOfMonth: 1,
    warningThreshold: 80,
  },
} as const;

export { VIDEO_SYNC_STATUS } from '~/db/schemas/videos';
export type { VideoSyncStatus } from '~/db/schemas/videos';
