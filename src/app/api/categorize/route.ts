import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories } from '~/db/schemas';
import { categorizeUserVideos } from '~/lib/ai/categorize';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import {
  checkAndResetQuotaIfNeeded,
  formatQuotaForClient,
  getUserQuotas,
} from '~/lib/quota';
import {
  categorizeVideosSchema,
  parseRequestBody,
  validateRequestBody,
} from '~/lib/validations/api';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await parseRequestBody(request);
    const { force } = validateRequestBody(categorizeVideosSchema, body);

    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, session.user.id))
      .limit(1);

    if (userCategories.length === 0) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'No categories found. Please create some categories first.',
      });
    }

    await checkAndResetQuotaIfNeeded(session.user.id);

    const result = await categorizeUserVideos(session.user.id, force);

    let quotas = null;
    let quotaFetchFailed = false;
    try {
      quotas = await getUserQuotas(session.user.id);
    } catch (quotaError) {
      quotaFetchFailed = true;
      logger.warn('Failed to fetch quotas after categorization', {
        quotaError,
        duration: Date.now() - startTime,
        userId: session.user.id,
      });
    }

    if (result.total === 0) {
      const quotaExceeded = quotas?.categorize.isExceeded ?? false;
      const message = quotaExceeded
        ? 'All videos are already categorized. Note: Your categorization quota has been exceeded.'
        : 'All videos are already categorized';

      const response = NextResponse.json({
        categorized: 0,
        total: 0,
        skipped: 0,
        message,
        ...(quotas && { quota: formatQuotaForClient(quotas) }),
        ...(quotaFetchFailed && { quotaFetchFailed: true }),
      });

      logger.api('POST', '/api/categorize', {
        userId: session.user.id,
        duration: Date.now() - startTime,
        status: 200,
        categorized: 0,
        quotaExceeded,
      });

      return response;
    }

    const response = NextResponse.json({
      categorized: result.categorized,
      total: result.total,
      skipped: result.skipped,
      message:
        result.total > 0
          ? `Categorized ${result.categorized} of ${result.total} videos`
          : 'All videos are already categorized',
      ...(quotas && { quota: formatQuotaForClient(quotas) }),
      ...(quotaFetchFailed && { quotaFetchFailed: true }),
    });

    logger.api('POST', '/api/categorize', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
      categorized: result.categorized,
    });

    return response;
  } catch (error) {
    logger.error('Error categorizing videos', error, {
      duration: Date.now() - startTime,
    });
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
