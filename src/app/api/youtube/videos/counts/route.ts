import { count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';

interface CountsResponse {
  /** Total number of videos */
  total: number;
  /** Videos without a category assigned */
  uncategorized: number;
  /** Count per category, keyed by categoryId */
  byCategory: Record<string, number>;
}

export async function GET() {
  const startTime = Date.now();
  try {
    const session = await requireSession();

    // Single query to get all counts grouped by categoryId
    const categoryCounts = await db
      .select({
        categoryId: videos.categoryId,
        count: count(),
      })
      .from(videos)
      .where(eq(videos.userId, session.user.id))
      .groupBy(videos.categoryId);

    // Also get total count in the same round-trip using a union-like approach
    // Actually, we can derive total from summing the grouped results
    let total = 0;
    let uncategorized = 0;
    const byCategory: Record<string, number> = {};

    for (const row of categoryCounts) {
      const rowCount = row.count;
      total += rowCount;

      if (row.categoryId === null) {
        uncategorized = rowCount;
      } else {
        byCategory[row.categoryId] = rowCount;
      }
    }

    const response: CountsResponse = {
      total,
      uncategorized,
      byCategory,
    };

    logger.api('GET', '/api/youtube/videos/counts', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
      categoryCount: Object.keys(byCategory).length,
    });

    return NextResponse.json(response);
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/youtube/videos/counts', {
      duration: Date.now() - startTime,
      status: errorResponse.statusCode,
      error: error instanceof Error ? error : undefined,
    });
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
