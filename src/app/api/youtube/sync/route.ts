import { NextResponse } from 'next/server';
import { handleApiError } from '~/lib/api-utils';
import { requireSession } from '~/lib/auth/session';
import { logger } from '~/lib/logger';
import { formatQuotaForClient, getUserQuotas } from '~/lib/quota';
import { runSync } from '~/lib/sync/engine';
import {
  parseRequestBody,
  syncVideosSchema,
  validateRequestBody,
} from '~/lib/validations/api';

/**
 * Legacy YouTube sync endpoint.
 * Wraps the generic sync engine with source=youtube, collection=likes.
 * Preserves the legacy response shape (unliked instead of inactive).
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await parseRequestBody(request);
    const { mode } = validateRequestBody(syncVideosSchema, body);

    const result = await runSync(session.user.id, 'youtube', 'likes', {
      mode,
      checkQuota: true,
    });

    let quotas = null;
    let quotaFetchFailed = false;
    try {
      quotas = await getUserQuotas(session.user.id);
    } catch (quotaError) {
      quotaFetchFailed = true;
      logger.warn('Failed to fetch quotas after sync', {
        quotaError,
        duration: Date.now() - startTime,
        userId: session.user.id,
      });
    }

    const response = NextResponse.json({
      synced: result.synced,
      new: result.new,
      existing: result.existing,
      unliked: result.inactive,
      reachedEnd: result.reachedEnd,
      message:
        result.new > 0
          ? `Synced ${result.new} new videos`
          : 'No new videos found',
      ...(quotas && { quota: formatQuotaForClient(quotas) }),
      ...(quotaFetchFailed && { quotaFetchFailed: true }),
    });

    logger.api('POST', '/api/youtube/sync', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
      mode,
      synced: result.synced,
      new: result.new,
    });

    return response;
  } catch (error) {
    logger.error('Error syncing videos', error, {
      duration: Date.now() - startTime,
    });
    return handleApiError(error, 'POST', '/api/youtube/sync', startTime);
  }
}
