import { and, count, eq, isNull, lt, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { categorizeUserVideos } from '~/lib/ai/categorize';
import { requireSession } from '~/lib/auth/session';
import { VIDEO_SYNC_STATUS } from '~/lib/constants';
import { AppError, createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import {
  checkAndResetQuotaIfNeeded,
  formatQuotaForClient,
  getUserQuotas,
} from '~/lib/quota';
import {
  categorizeVideosSchema,
  validateRequestBody,
} from '~/lib/validations/api';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));

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

    const latestCategoryUpdate = userCategories.reduce((latest, category) => {
      const updatedAt = category.updatedAt;
      if (!updatedAt) return latest;
      return updatedAt > latest ? updatedAt : latest;
    }, new Date(0));

    // Use count() instead of selecting all IDs for better performance
    // This avoids loading potentially thousands of IDs into memory
    const videosToAnalyzeResult = await db
      .select({ count: count() })
      .from(videos)
      .where(
        force
          ? and(
              eq(videos.userId, session.user.id),
              eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE)
            )
          : and(
              eq(videos.userId, session.user.id),
              eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE),
              or(
                isNull(videos.categoryId),
                isNull(videos.lastAnalyzedAt),
                lt(videos.lastAnalyzedAt, latestCategoryUpdate)
              )
            )
      );

    const videosToAnalyzeCount = videosToAnalyzeResult[0]?.count ?? 0;

    // Check quota status early for consistency, even when there are no videos to categorize
    await checkAndResetQuotaIfNeeded(session.user.id);
    let quotas = null;
    try {
      quotas = await getUserQuotas(session.user.id);
    } catch (quotaError) {
      logger.warn('Failed to fetch quotas', { quotaError });
    }

    if (videosToAnalyzeCount === 0) {
      // Even though there are no videos to categorize, we check quota for consistency
      // and to provide users with quota status information
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

    // Validate quota before processing videos
    if (quotas?.categorize.isExceeded) {
      const daysUntilReset = quotas.categorize.resetAt
        ? Math.ceil(
            (quotas.categorize.resetAt.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      throw new AppError({
        code: 'QUOTA_EXCEEDED',
        message: `Categorization quota exceeded. Used: ${quotas.categorize.used}/${quotas.categorize.limit}. Resets in ${daysUntilReset} days.`,
      });
    }

    const result = await categorizeUserVideos(session.user.id, force);

    // Refresh quotas after categorization (in case they changed)
    try {
      quotas = await getUserQuotas(session.user.id);
    } catch (quotaError) {
      logger.warn('Failed to fetch quotas after categorization', {
        quotaError,
        duration: Date.now() - startTime,
        userId: session.user.id,
      });
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
