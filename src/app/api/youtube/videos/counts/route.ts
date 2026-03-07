import { and, count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { handleApiError } from '~/lib/api-utils';
import { requireSession } from '~/lib/auth/session';
import { logger } from '~/lib/logger';

export async function GET() {
  const startTime = Date.now();
  try {
    const session = await requireSession();

    // Scope to YouTube likes only (legacy compat)
    const categoryCounts = await db
      .select({
        categoryId: videos.categoryId,
        count: count(),
      })
      .from(videos)
      .where(and(eq(videos.userId, session.user.id), eq(videos.source, 'youtube')))
      .groupBy(videos.categoryId);

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

    logger.api('GET', '/api/youtube/videos/counts', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
      categoryCount: Object.keys(byCategory).length,
    });

    return NextResponse.json({ total, uncategorized, byCategory });
  } catch (error) {
    return handleApiError(error, 'GET', '/api/youtube/videos/counts', startTime);
  }
}
