import { NextResponse } from 'next/server';
import { handleApiError } from '~/lib/api-utils';
import { requireSession } from '~/lib/auth/session';
import { logger } from '~/lib/logger';
import { formatQuotaForClient, getUserQuotas } from '~/lib/quota';
import { isValidSourceCollection } from '~/lib/sources/types';
import { runSync } from '~/lib/sync/engine';
import {
  parseRequestBody,
  syncContentSchema,
  validateRequestBody,
} from '~/lib/validations/api';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await parseRequestBody(request);
    const { source, collection, mode } = validateRequestBody(
      syncContentSchema,
      body
    );

    if (!isValidSourceCollection(source, collection)) {
      return NextResponse.json(
        {
          error: `Unsupported source/collection combination: ${source}/${collection}`,
          code: 'FORBIDDEN',
        },
        { status: 403 }
      );
    }

    const result = await runSync(session.user.id, source, collection, {
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

    const response = {
      source: result.source,
      collection: result.collection,
      mode: result.mode,
      synced: result.synced,
      new: result.new,
      existing: result.existing,
      inactive: result.inactive,
      reachedEnd: result.reachedEnd,
      message:
        result.new > 0
          ? `Synced ${result.new} new items`
          : 'No new items found',
      ...(quotas && { quota: formatQuotaForClient(quotas) }),
      ...(quotaFetchFailed && { quotaFetchFailed: true }),
    };

    logger.api('POST', '/api/sync', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
      source,
      collection,
      mode,
      synced: result.synced,
      new: result.new,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Error syncing content', error, {
      duration: Date.now() - startTime,
    });
    return handleApiError(error, 'POST', '/api/sync', startTime);
  }
}
