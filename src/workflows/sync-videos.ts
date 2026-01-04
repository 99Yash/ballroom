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
import { fullSync, quickSync } from '~/lib/sync';

const syncPayloadSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

/**
 * Centralized error handler for sync workflow tasks.
 *
 * **IMPORTANT: This function never returns normally. It always throws an error.**
 *
 * Handles different error types with appropriate metadata, logging, and retry behavior.
 * Sets common metadata fields for all errors, then applies type-specific handling.
 *
 * **Error Handling Strategy:**
 * - **AuthenticationError**: Non-retriable. Aborts the task run immediately since the user
 *   must re-authenticate. Sets `errorType: 'auth_error'` and `aborted: true` metadata.
 *   Also captures `authErrorType` and `requiresReauthentication` for debugging.
 *
 * - **AppError with QUOTA_EXCEEDED**: Non-retriable. Aborts the task run since quota limits
 *   won't resolve with retries. Sets `errorType: 'quota_exceeded'` and `aborted: true` metadata.
 *
 * - **All other errors**: Retriable. Re-throws the error to trigger Trigger.dev's retry mechanism.
 *   Sets `errorType: 'retriable_error'` and `willRetry: true` metadata before re-throwing.
 *
 * **Common Metadata Set:**
 * - `status: 'failed'` - Indicates the sync failed
 * - `errorMessage` - String representation of the error message
 * - `endTime` - ISO timestamp when the error occurred
 *
 * @param error - The error that occurred during sync. Can be any type (Error, AppError, AuthenticationError, etc.)
 * @param payload - The task payload containing the userId for logging and context
 * @param ctx - Task context containing the run ID for logging and tracking
 *
 * @throws {AbortTaskRunError} For AuthenticationError and QUOTA_EXCEEDED errors, preventing retries
 * @throws {Error} For retriable errors, re-throws the original error to trigger retry mechanism
 *
 * @returns {never} This function never returns normally - it always throws
 */
function handleSyncError(
  error: unknown,
  payload: { userId: string },
  ctx: { run: { id: string } }
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
      runId: ctx.run.id,
      authErrorType: error.authErrorType,
      error: error.message,
    });
    throw new AbortTaskRunError(error.message);
  }

  if (error instanceof AppError && error.code === 'QUOTA_EXCEEDED') {
    metadata.set('errorType', 'quota_exceeded').set('aborted', true);

    logger.warn('Sync aborted - quota exceeded', {
      userId: payload.userId,
      runId: ctx.run.id,
      error: error.message,
    });
    throw new AbortTaskRunError(error.message);
  }

  metadata.set('errorType', 'retriable_error').set('willRetry', true);

  logger.error('Sync failed - will retry', {
    userId: payload.userId,
    runId: ctx.run.id,
    error: error instanceof Error ? error.message : String(error),
  });

  // Re-throw the error to trigger Trigger.dev's retry mechanism
  // All code paths must throw to satisfy the 'never' return type
  if (error instanceof Error) {
    throw error;
  }

  // Fallback: convert non-Error values to an Error instance
  // Runtime safeguard for unexpected error types, while keeping all code paths throwing
  throw new Error(String(error));
}

/**
 * Initial sync task - triggered after user completes onboarding or requests full sync
 * Fetches ALL liked videos using progressive sync (no auto-categorization)
 */
export const initialSyncTask = schemaTask({
  id: 'initial-sync',
  schema: syncPayloadSchema,
  maxDuration: 600,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  catchError: async ({ error, ctx, payload }) => {
    handleSyncError(error, payload, ctx);
  },
  run: async ({ userId }) => {
    logger.info('Starting initial sync for user', { userId });

    await tags.add(`user:${userId}`);
    await tags.add('sync-type:initial');

    metadata
      .set('status', 'starting')
      .set('userId', userId)
      .set('phase', 'sync')
      .set('maxDepth', APP_CONFIG.sync.progressiveMaxDepth)
      .set('startTime', new Date().toISOString());

    metadata.set('status', 'syncing');

    const syncResult = await fullSync(userId, { checkQuota: true });

    logger.info('Initial sync completed', {
      userId,
      synced: syncResult.synced,
      new: syncResult.new,
      existing: syncResult.existing,
      unliked: syncResult.unliked,
      reachedEnd: syncResult.reachedEnd,
    });

    metadata
      .set('status', 'completed')
      .set('syncCompleted', true)
      .set('videosSynced', syncResult.synced)
      .set('newVideos', syncResult.new)
      .set('existingVideos', syncResult.existing)
      .set('unlikedVideos', syncResult.unliked)
      .set('reachedEnd', syncResult.reachedEnd)
      .set('endTime', new Date().toISOString());

    return { sync: syncResult };
  },
});

/**
 * Incremental sync task - called by the hourly schedule
 * Uses progressive sync with quick limits (no auto-categorization)
 */
export const incrementalSyncTask = schemaTask({
  id: 'incremental-sync',
  schema: syncPayloadSchema,
  maxDuration: 300,
  queue: {
    concurrencyLimit: 5,
  },
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
    factor: 2,
    randomize: true,
  },
  catchError: async ({ error, ctx, payload }) => {
    handleSyncError(error, payload, ctx);
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
      .set('initialLimit', APP_CONFIG.sync.quickSyncLimit)
      .set('startTime', new Date().toISOString());

    metadata.set('status', 'syncing');

    const syncResult = await quickSync(userId, { checkQuota: true });

    logger.info('Incremental sync completed', {
      userId,
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
  },
});
