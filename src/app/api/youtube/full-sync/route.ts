import { NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { initialSyncTask } from '~/workflows/sync-videos';

/**
 * DEVELOPMENT ONLY: Trigger a full sync of all liked videos
 *
 * This endpoint is expensive and should only be used in development:
 * - After dev server downtime
 * - When you need to ensure all historical videos are synced
 *
 * Rate limited to 1 request per user per 5 minutes.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

// In-memory rate limiting (per user, resets on server restart)
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const rateLimitMap = new Map<string, number>();
// Map to track pending rate limit checks per user (prevents race conditions)
const rateLimitLocks = new Map<string, Promise<void>>();

/**
 * Atomically check and update rate limit for a user.
 * Uses a per-user lock to prevent concurrent requests from bypassing rate limits.
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  // Wait for any pending rate limit check for this user
  const existingLock = rateLimitLocks.get(userId);
  if (existingLock) {
    await existingLock;
  }

  // Create a new lock for this check
  let resolveLock: () => void;
  const lock = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  rateLimitLocks.set(userId, lock);

  try {
    const lastRequest = rateLimitMap.get(userId);
    const now = Date.now();

    if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
      return true; // Rate limited
    }

    // Atomically update the timestamp
    rateLimitMap.set(userId, now);
    return false; // Not rate limited
  } finally {
    // Release the lock
    resolveLock!();
    // Clean up the lock after a short delay to allow any waiting requests to proceed
    setTimeout(() => {
      if (rateLimitLocks.get(userId) === lock) {
        rateLimitLocks.delete(userId);
      }
    }, 100);
  }
}

function getRemainingCooldown(userId: string): number {
  const lastRequest = rateLimitMap.get(userId);
  if (!lastRequest) return 0;

  const elapsed = Date.now() - lastRequest;
  const remaining = RATE_LIMIT_WINDOW_MS - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000)); // Return seconds
}

export async function POST() {
  const startTime = Date.now();

  try {
    // STRICT: Only allow in development environment
    if (!isDevelopment) {
      logger.warn('Full sync attempted in non-development environment');
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Full sync is only available in development environment.',
      });
    }

    const session = await requireSession();
    const userId = session.user.id;

    // STRICT: Rate limiting - max 1 request per 5 minutes per user
    // Uses atomic check-and-update to prevent race conditions
    const isLimited = await checkRateLimit(userId);
    if (isLimited) {
      const remainingSeconds = getRemainingCooldown(userId);
      logger.warn('Full sync rate limited', {
        userId,
        remainingSeconds,
      });
      throw new AppError({
        code: 'TOO_MANY_REQUESTS',
        message: `Full sync is rate limited. Please wait ${remainingSeconds} seconds before trying again.`,
      });
    }

    logger.info('Starting full sync (dev only)', {
      userId,
      environment: process.env.NODE_ENV,
    });

    const handle = await initialSyncTask.trigger({ userId });

    logger.api('POST', '/api/youtube/full-sync', {
      userId,
      duration: Date.now() - startTime,
      status: 200,
      runId: handle.id,
    });

    return NextResponse.json({
      success: true,
      message:
        'Full sync started in background. This may take a few minutes for large libraries.',
      runId: handle.id,
      cooldownSeconds: RATE_LIMIT_WINDOW_MS / 1000,
    });
  } catch (error) {
    logger.error('Error triggering full sync', error, {
      duration: Date.now() - startTime,
    });
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
