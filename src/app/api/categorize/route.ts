import { and, eq, isNull, lt, or } from 'drizzle-orm';
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

    const videosToAnalyzeCount = await db
      .select({ id: videos.id })
      .from(videos)
      .where(
        and(
          eq(videos.userId, session.user.id),
          eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE),
          force
            ? undefined
            : or(
                isNull(videos.categoryId),
                isNull(videos.lastAnalyzedAt),
                lt(videos.lastAnalyzedAt, latestCategoryUpdate)
              )
        )
      );

    if (videosToAnalyzeCount.length === 0) {
      const quotas = await getUserQuotas(session.user.id);
      return NextResponse.json({
        categorized: 0,
        total: 0,
        skipped: 0,
        message: 'All videos are already categorized',
        quota: formatQuotaForClient(quotas),
      });
    }

    await checkQuota(
      session.user.id,
      'categorize',
      videosToAnalyzeCount.length
    );

    const result = await categorizeUserVideos(session.user.id, force);

    if (result.categorized > 0) {
      if (result.categorized !== videosToAnalyzeCount.length) {
        logger.warn('Mismatch between expected and actual categorized videos', {
          userId: session.user.id,
          expected: videosToAnalyzeCount.length,
          actual: result.categorized,
        });
      }

      await incrementQuota(session.user.id, 'categorize', result.categorized);
    }

    const quotas = await getUserQuotas(session.user.id);

    logger.api('POST', '/api/categorize', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
      categorized: result.categorized,
    });

    return NextResponse.json({
      categorized: result.categorized,
      total: result.total,
      skipped: result.skipped,
      message:
        result.total > 0
          ? `Categorized ${result.categorized} of ${result.total} videos`
          : 'All videos are already categorized',
      quota: formatQuotaForClient(quotas),
    });
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
