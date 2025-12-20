import {
  AbortTaskRunError,
  logger,
  metadata,
  schemaTask,
  tags,
} from '@trigger.dev/sdk';
import * as z from 'zod/v4';
import { categorizeUserVideos } from '~/lib/ai/categorize';
import { AuthenticationError } from '~/lib/errors';
import { syncLikedVideosForUser } from '~/lib/youtube';

/**
 * Shared payload schema for sync tasks
 */
const syncPayloadSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

/**
 * Initial sync task - triggered after user completes onboarding
 * Fetches ALL liked videos (no limit) and categorizes them
 */
export const initialSyncTask = schemaTask({
  id: 'initial-sync',
  schema: syncPayloadSchema,
  maxDuration: 600, // 10 minutes max for initial sync
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  catchError: async ({ error, ctx, payload }) => {
    metadata
      .set('status', 'failed')
      .set(
        'errorMessage',
        error instanceof Error ? error.message : String(error)
      )
      .set('endTime', new Date().toISOString());

    if (error instanceof AuthenticationError) {
      metadata
        .set('errorType', 'auth_error')
        .set('authErrorType', error.authErrorType)
        .set('requiresReauthentication', error.requiresReauthentication())
        .set('aborted', true);

      logger.error('Initial sync aborted - auth error', {
        userId: payload.userId,
        runId: ctx.run.id,
        authErrorType: error.authErrorType,
        error: error.message,
      });
      throw new AbortTaskRunError(error.message);
    }

    metadata.set('errorType', 'retriable_error').set('willRetry', true);

    logger.error('Initial sync failed', {
      userId: payload.userId,
      runId: ctx.run.id,
      error: error instanceof Error ? error.message : String(error),
    });
  },
  run: async ({ userId }) => {
    logger.info('Starting initial sync for user', { userId });

    await tags.add(`user:${userId}`);
    await tags.add('sync-type:initial');

    metadata
      .set('status', 'starting')
      .set('userId', userId)
      .set('phase', 'sync')
      .set('startTime', new Date().toISOString());

    metadata.set('status', 'syncing');

    const syncResult = await syncLikedVideosForUser(userId);

    logger.info('Synced videos from YouTube', {
      userId,
      synced: syncResult.synced,
      new: syncResult.new,
    });

    metadata
      .set('syncCompleted', true)
      .set('videosSynced', syncResult.synced)
      .set('newVideos', syncResult.new);

    if (syncResult.new > 0) {
      metadata
        .set('status', 'categorizing')
        .set('phase', 'categorization')
        .set('totalToCategorize', syncResult.new);

      const categorizeResult = await categorizeUserVideos(userId);

      logger.info('Categorized videos', {
        userId,
        categorized: categorizeResult.categorized,
        total: categorizeResult.total,
      });

      metadata
        .set('status', 'completed')
        .set('categorizeCompleted', true)
        .set('videosCategorized', categorizeResult.categorized)
        .set('totalVideos', categorizeResult.total)
        .set('videosSkipped', categorizeResult.skipped)
        .set('endTime', new Date().toISOString());

      return {
        sync: syncResult,
        categorize: categorizeResult,
      };
    }

    metadata
      .set('status', 'completed')
      .set('categorizeCompleted', false)
      .set('reason', 'no_new_videos')
      .set('endTime', new Date().toISOString());

    return {
      sync: syncResult,
      categorize: { categorized: 0, total: 0, skipped: 0 },
    };
  },
});

/**
 * Incremental sync task - called by the hourly schedule
 * Fetches only recent videos (limit 50) and categorizes new ones
 */
export const incrementalSyncTask = schemaTask({
  id: 'incremental-sync',
  schema: syncPayloadSchema,
  maxDuration: 300, // 5 minutes max
  queue: {
    concurrencyLimit: 5, // Process max 5 users concurrently to avoid rate limits
  },
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
    factor: 2,
    randomize: true,
  },
  catchError: async ({ error, ctx, payload }) => {
    metadata
      .set('status', 'failed')
      .set(
        'errorMessage',
        error instanceof Error ? error.message : String(error)
      )
      .set('endTime', new Date().toISOString());

    if (error instanceof AuthenticationError) {
      metadata
        .set('errorType', 'auth_error')
        .set('authErrorType', error.authErrorType)
        .set('requiresReauthentication', error.requiresReauthentication())
        .set('aborted', true);

      logger.warn('Incremental sync aborted - auth error', {
        userId: payload.userId,
        runId: ctx.run.id,
        authErrorType: error.authErrorType,
        error: error.message,
      });
      throw new AbortTaskRunError(error.message);
    }

    metadata.set('errorType', 'retriable_error').set('willRetry', true);

    logger.error('Incremental sync failed', {
      userId: payload.userId,
      runId: ctx.run.id,
      error: error instanceof Error ? error.message : String(error),
    });
  },
  run: async ({ userId }) => {
    logger.info('Starting incremental sync for user', { userId });

    await tags.add(`user:${userId}`);
    await tags.add('sync-type:incremental');

    metadata
      .set('status', 'starting')
      .set('userId', userId)
      .set('phase', 'sync')
      .set('syncType', 'incremental')
      .set('startTime', new Date().toISOString());

    metadata.set('status', 'syncing').set('limit', 50);

    const syncResult = await syncLikedVideosForUser(userId, 50);

    logger.info('Incremental sync completed', {
      userId,
      synced: syncResult.synced,
      new: syncResult.new,
    });

    metadata
      .set('syncCompleted', true)
      .set('videosSynced', syncResult.synced)
      .set('newVideos', syncResult.new);

    if (syncResult.new > 0) {
      metadata
        .set('status', 'categorizing')
        .set('phase', 'categorization')
        .set('totalToCategorize', syncResult.new);

      const categorizeResult = await categorizeUserVideos(userId);

      logger.info('Categorized new videos', {
        userId,
        categorized: categorizeResult.categorized,
      });

      metadata
        .set('status', 'completed')
        .set('categorizeCompleted', true)
        .set('videosCategorized', categorizeResult.categorized)
        .set('totalVideos', categorizeResult.total)
        .set('videosSkipped', categorizeResult.skipped)
        .set('endTime', new Date().toISOString());

      return {
        sync: syncResult,
        categorize: categorizeResult,
      };
    }

    metadata
      .set('status', 'completed')
      .set('categorizeCompleted', false)
      .set('reason', 'no_new_videos')
      .set('endTime', new Date().toISOString());

    return {
      sync: syncResult,
      categorize: { categorized: 0, total: 0, skipped: 0 },
    };
  },
});
