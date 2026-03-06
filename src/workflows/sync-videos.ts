import {
  AbortTaskRunError,
  logger,
  metadata,
  schemaTask,
  tags,
} from '@trigger.dev/sdk';
import * as z from 'zod/v4';
import { APP_CONFIG } from '~/lib/constants';
import { AppError, AuthenticationError } from '~/lib/errors';
import type { CollectionType, ContentSource } from '~/lib/sources/types';
import { runSync } from '~/lib/sync/engine';

const syncPayloadSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  source: z.enum(['youtube', 'x']).default('youtube'),
  collection: z.enum(['likes', 'bookmarks']).default('likes'),
});

type SyncPayload = z.infer<typeof syncPayloadSchema>;

function buildConcurrencyKey(payload: SyncPayload): string {
  return `${payload.userId}:${payload.source}:${payload.collection}`;
}

function handleSyncError(
  error: unknown,
  payload: SyncPayload,
  runId: string
): never {
  metadata
    .set('status', 'failed')
    .set('errorMessage', error instanceof Error ? error.message : String(error))
    .set('endTime', new Date().toISOString());

  if (error instanceof AuthenticationError) {
    metadata
      .set('errorType', 'auth_error')
      .set('authErrorType', error.authErrorType)
      .set('requiresReauthentication', error.requiresReauthentication())
      .set('aborted', true);

    logger.error('Sync aborted - auth error', {
      userId: payload.userId,
      source: payload.source,
      collection: payload.collection,
      runId,
      authErrorType: error.authErrorType,
      error: error.message,
    });
    throw new AbortTaskRunError(error.message);
  }

  if (
    error instanceof AppError &&
    (error.code === 'QUOTA_EXCEEDED' || error.code === 'TOO_MANY_REQUESTS')
  ) {
    metadata
      .set('errorType', error.code === 'QUOTA_EXCEEDED' ? 'quota_exceeded' : 'cooldown')
      .set('aborted', true);

    logger.warn(`Sync aborted - ${error.code.toLowerCase()}`, {
      userId: payload.userId,
      source: payload.source,
      collection: payload.collection,
      runId,
      error: error.message,
    });
    throw new AbortTaskRunError(error.message);
  }

  metadata.set('errorType', 'retriable_error').set('willRetry', true);

  logger.error('Sync failed - will retry', {
    userId: payload.userId,
    source: payload.source,
    collection: payload.collection,
    runId,
    error: error instanceof Error ? error.message : String(error),
  });

  if (error instanceof Error) {
    throw error;
  }

  throw new Error(String(error));
}

/**
 * Initial sync task - triggered after user completes onboarding or requests full sync.
 * Source-aware: accepts source + collection in payload.
 *
 * Concurrency key: `userId:source:collection` — prevents concurrent syncs
 * for the same user/source/collection while allowing parallel syncs across
 * different sources (e.g. YouTube likes + X bookmarks simultaneously).
 */
export const initialSyncTask = schemaTask({
  id: 'initial-sync',
  schema: syncPayloadSchema,
  maxDuration: 600,
  queue: {
    name: 'user-sync',
    concurrencyLimit: 1,
  },
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  run: async (payload, { ctx }) => {
    const { userId, source, collection } = payload;
    logger.info('Starting initial sync', { userId, source, collection });

    await tags.add(`user:${userId}`);
    await tags.add('sync-type:initial');
    await tags.add(`source:${source}`);
    await tags.add(`collection:${collection}`);

    const sourceLimits = APP_CONFIG.sourceLimits[source];

    metadata
      .set('status', 'starting')
      .set('userId', userId)
      .set('source', source)
      .set('collection', collection)
      .set('phase', 'sync')
      .set('maxDepth', sourceLimits.maxDepth)
      .set('startTime', new Date().toISOString());

    metadata.set('status', 'syncing');

    try {
      const syncResult = await runSync(userId, source, collection, {
        mode: 'full',
        checkQuota: true,
      });

      logger.info('Initial sync completed', {
        userId,
        source,
        collection,
        synced: syncResult.synced,
        new: syncResult.new,
        existing: syncResult.existing,
        inactive: syncResult.inactive,
        reachedEnd: syncResult.reachedEnd,
      });

      metadata
        .set('status', 'completed')
        .set('syncCompleted', true)
        .set('videosSynced', syncResult.synced)
        .set('newVideos', syncResult.new)
        .set('existingVideos', syncResult.existing)
        .set('inactiveItems', syncResult.inactive)
        .set('reachedEnd', syncResult.reachedEnd)
        .set('endTime', new Date().toISOString());

      return { sync: syncResult };
    } catch (error) {
      handleSyncError(error, payload, ctx.run.id);
    }
  },
});

/**
 * Incremental sync task - called by the hourly schedule.
 * Source-aware: accepts source + collection in payload.
 *
 * Concurrency key: `userId:source:collection` — prevents concurrent syncs
 * for the same user/source/collection.
 */
export const incrementalSyncTask = schemaTask({
  id: 'incremental-sync',
  schema: syncPayloadSchema,
  maxDuration: 300,
  queue: {
    name: 'user-sync',
    concurrencyLimit: 1,
  },
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
    factor: 2,
    randomize: true,
  },
  run: async (payload, { ctx }) => {
    const { userId, source, collection } = payload;
    logger.info('Starting incremental sync', { userId, source, collection });

    await tags.add(`user:${userId}`);
    await tags.add('sync-type:incremental');
    await tags.add(`source:${source}`);
    await tags.add(`collection:${collection}`);

    const sourceLimits = APP_CONFIG.sourceLimits[source];

    metadata
      .set('status', 'starting')
      .set('userId', userId)
      .set('source', source)
      .set('collection', collection)
      .set('phase', 'sync')
      .set('syncType', 'incremental')
      .set('initialLimit', sourceLimits.quickSyncLimit)
      .set('startTime', new Date().toISOString());

    metadata.set('status', 'syncing');

    try {
      const syncResult = await runSync(userId, source, collection, {
        mode: 'quick',
        checkQuota: true,
      });

      logger.info('Incremental sync completed', {
        userId,
        source,
        collection,
        synced: syncResult.synced,
        new: syncResult.new,
        existing: syncResult.existing,
      });

      metadata
        .set('status', 'completed')
        .set('syncCompleted', true)
        .set('videosSynced', syncResult.synced)
        .set('newVideos', syncResult.new)
        .set('existingVideos', syncResult.existing)
        .set('reachedEnd', syncResult.reachedEnd)
        .set('endTime', new Date().toISOString());

      return { sync: syncResult };
    } catch (error) {
      handleSyncError(error, payload, ctx.run.id);
    }
  },
});

/**
 * Trigger initial sync with per-user/source/collection concurrency key.
 * Prevents concurrent syncs for the same source/collection while allowing
 * parallel syncs across different sources.
 *
 * Use this instead of initialSyncTask.trigger() directly.
 */
export async function triggerInitialSync(
  userId: string,
  source: ContentSource = 'youtube',
  collection: CollectionType = 'likes'
) {
  const payload = { userId, source, collection };
  return initialSyncTask.trigger(payload, {
    concurrencyKey: buildConcurrencyKey(payload),
  });
}

/**
 * Trigger incremental sync with per-user/source/collection concurrency key.
 * Use this instead of incrementalSyncTask.trigger() directly.
 */
export async function triggerIncrementalSync(
  userId: string,
  source: ContentSource = 'youtube',
  collection: CollectionType = 'likes'
) {
  const payload = { userId, source, collection };
  return incrementalSyncTask.trigger(payload, {
    concurrencyKey: buildConcurrencyKey(payload),
  });
}

export interface SyncItem {
  userId: string;
  source: ContentSource;
  collection: CollectionType;
}

/**
 * Batch trigger incremental syncs with per-user/source/collection concurrency keys.
 * Each (user, source, collection) triple gets its own queue partition.
 * Use this instead of incrementalSyncTask.batchTrigger() directly.
 */
export async function batchTriggerIncrementalSync(items: SyncItem[]) {
  if (items.length === 0) return;
  return incrementalSyncTask.batchTrigger(
    items.map((item) => ({
      payload: item,
      options: { concurrencyKey: buildConcurrencyKey(item) },
    }))
  );
}
