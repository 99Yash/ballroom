import { NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { formatQuotaForClient, getUserQuotas } from '~/lib/quota';
import { extendedSync, quickSync } from '~/lib/sync';
import { syncVideosSchema, validateRequestBody } from '~/lib/validations/api';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));

    const { mode } = validateRequestBody(syncVideosSchema, body);

    const syncFn = mode === 'extended' ? extendedSync : quickSync;
    const result = await syncFn(session.user.id, { checkQuota: true });

    let quotas = null;
    try {
      quotas = await getUserQuotas(session.user.id);
    } catch (quotaError) {
      logger.warn('Failed to fetch quotas after sync', quotaError, {
        userId: session.user.id,
      });
    }

    const response = NextResponse.json({
      synced: result.synced,
      new: result.new,
      existing: result.existing,
      unliked: result.unliked,
      reachedEnd: result.reachedEnd,
      message:
        result.new > 0
          ? `Synced ${result.new} new videos`
          : 'No new videos found',
      ...(quotas && { quota: formatQuotaForClient(quotas) }),
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
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
