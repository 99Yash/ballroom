import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories } from '~/db/schemas';
import { categorizeUserVideos } from '~/lib/ai/categorize';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
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

    const result = await categorizeUserVideos(session.user.id, force);

    const response = NextResponse.json({
      categorized: result.categorized,
      total: result.total,
      skipped: result.skipped,
      message:
        result.total > 0
          ? `Categorized ${result.categorized} of ${result.total} videos`
          : 'All videos are already categorized',
    });

    logger.api('POST', '/api/categorize', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
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
