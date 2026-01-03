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
  checkQuota,
  formatQuotaForClient,
  getUserQuotas,
  incrementQuota,
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

    if (videosToAnalyzeCount === 0) {
      const quotas = await getUserQuotas(session.user.id);
      const response = NextResponse.json({
        categorized: 0,
        total: 0,
        skipped: 0,
        message: 'All videos are already categorized',
        quota: formatQuotaForClient(quotas),
      });

      logger.api('POST', '/api/categorize', {
        userId: session.user.id,
        duration: Date.now() - startTime,
        status: 200,
        categorized: 0,
      });

      return response;
    }

    await checkQuota(session.user.id, 'categorize', videosToAnalyzeCount);

    const result = await categorizeUserVideos(session.user.id, force);

    if (result.categorized > 0) {
      if (result.categorized !== videosToAnalyzeCount) {
        logger.warn('Mismatch between expected and actual categorized videos', {
          userId: session.user.id,
          expected: videosToAnalyzeCount,
          actual: result.categorized,
        });
      }

      await incrementQuota(session.user.id, 'categorize', result.categorized);
    }

    const quotas = await getUserQuotas(session.user.id);

    const response = NextResponse.json({
      categorized: result.categorized,
      total: result.total,
      skipped: result.skipped,
      message:
        result.total > 0
          ? `Categorized ${result.categorized} of ${result.total} videos`
          : 'All videos are already categorized',
      quota: formatQuotaForClient(quotas),
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
