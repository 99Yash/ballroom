import {
  AbortTaskRunError,
  logger,
  metadata,
  schemaTask,
  tags,
} from '@trigger.dev/sdk';
import { z } from 'zod';
import { categorizeUserVideos } from '~/lib/ai/categorize';
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
    // Update metadata with error status
    metadata
      .set('status', 'failed')
      .set(
        'errorMessage',
        error instanceof Error ? error.message : String(error)
      )
      .set('endTime', new Date().toISOString());

    // Abort on authentication errors - user needs to re-authenticate
    if (
      error instanceof Error &&
      (error.message.includes('No access token') ||
        error.message.includes('No refresh token') ||
        error.message.includes('No Google account'))
    ) {
      metadata.set('errorType', 'auth_error').set('aborted', true);

      logger.error('Initial sync aborted - auth error', {
        userId: payload.userId,
        runId: ctx.run.id,
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

    // Allow retry for other errors
  },
  run: async ({ userId }) => {
    logger.info('Starting initial sync for user', { userId });

    // Add tags for filtering and monitoring
    await tags.add(`user:${userId}`);
    await tags.add('sync-type:initial');

    // Initialize progress tracking
    metadata
      .set('status', 'starting')
      .set('userId', userId)
      .set('phase', 'sync')
      .set('startTime', new Date().toISOString());

    // Step 1: Sync all liked videos from YouTube
    metadata.set('status', 'syncing');

    const syncResult = await syncLikedVideosForUser(userId);

    logger.info('Synced videos from YouTube', {
      userId,
      synced: syncResult.synced,
      new: syncResult.new,
    });

    // Update metadata with sync results
    metadata
      .set('syncCompleted', true)
      .set('videosSynced', syncResult.synced)
      .set('newVideos', syncResult.new);

    // Step 2: Categorize all videos
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

      // Update metadata with categorization results
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

    // No new videos to categorize
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
  },
  catchError: async ({ error, ctx, payload }) => {
    // Update metadata with error status
    metadata
      .set('status', 'failed')
      .set(
        'errorMessage',
        error instanceof Error ? error.message : String(error)
      )
      .set('endTime', new Date().toISOString());

    // Abort on authentication errors - user needs to re-authenticate
    if (
      error instanceof Error &&
      (error.message.includes('No access token') ||
        error.message.includes('No refresh token') ||
        error.message.includes('No Google account'))
    ) {
      metadata.set('errorType', 'auth_error').set('aborted', true);

      logger.warn('Incremental sync aborted - auth error', {
        userId: payload.userId,
        runId: ctx.run.id,
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

    // Allow retry for other errors
  },
  run: async ({ userId }) => {
    logger.info('Starting incremental sync for user', { userId });

    // Add tags for filtering and monitoring
    await tags.add(`user:${userId}`);
    await tags.add('sync-type:incremental');

    // Initialize progress tracking
    metadata
      .set('status', 'starting')
      .set('userId', userId)
      .set('phase', 'sync')
      .set('syncType', 'incremental')
      .set('startTime', new Date().toISOString());

    // Fetch only recent videos (last 50)
    metadata.set('status', 'syncing').set('limit', 50);

    const syncResult = await syncLikedVideosForUser(userId, 50);

    logger.info('Incremental sync completed', {
      userId,
      synced: syncResult.synced,
      new: syncResult.new,
    });

    // Update metadata with sync results
    metadata
      .set('syncCompleted', true)
      .set('videosSynced', syncResult.synced)
      .set('newVideos', syncResult.new);

    // Only categorize if we found new videos
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

      // Update metadata with categorization results
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

    // No new videos to categorize
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
