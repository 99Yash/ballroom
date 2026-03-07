import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, createVideoSearchVector, videos } from '~/db/schemas';
import {
  buildPrefixTsquery,
  handleApiError,
  parsePagination,
  validateSearchQuery,
} from '~/lib/api-utils';
import { requireSession } from '~/lib/auth/session';
import { logger } from '~/lib/logger';
import { serializeVideo } from '~/types/video';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const uncategorized = searchParams.get('uncategorized') === 'true';

    const { query: searchQuery, errorResponse: searchError } =
      validateSearchQuery(searchParams);
    if (searchError) return searchError;

    // Scope to YouTube likes only (legacy compat)
    const baseConditions: SQL[] = [
      eq(videos.userId, session.user.id),
      eq(videos.source, 'youtube'),
    ];

    if (uncategorized) {
      baseConditions.push(isNull(videos.categoryId));
    } else if (categoryId) {
      baseConditions.push(eq(videos.categoryId, categoryId));
    }

    let searchRank: SQL | null = null;
    if (searchQuery) {
      const tsquery = buildPrefixTsquery(searchQuery);
      const searchExpr = createVideoSearchVector(
        videos.title,
        videos.description,
        videos.channelName
      );
      baseConditions.push(sql`${searchExpr} @@ ${tsquery}`);
      searchRank = sql`ts_rank(${searchExpr}, ${tsquery})`;
    }

    const { page, limit, offset } = parsePagination(searchParams);

    const queryBuilder = db
      .select({
        id: videos.id,
        youtubeId: videos.youtubeId,
        title: videos.title,
        description: videos.description,
        thumbnailUrl: videos.thumbnailUrl,
        channelName: videos.channelName,
        publishedAt: videos.publishedAt,
        categoryId: videos.categoryId,
        categoryName: categories.name,
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
      })
      .from(videos)
      .leftJoin(categories, eq(videos.categoryId, categories.id))
      .where(and(...baseConditions));

    const orderedQuery = searchRank
      ? queryBuilder.orderBy(desc(searchRank), desc(videos.createdAt))
      : queryBuilder.orderBy(desc(videos.createdAt));

    const userVideos = await orderedQuery.limit(limit).offset(offset);

    const totalCount = userVideos[0]?.totalCount ?? 0;

    const serializedVideos = userVideos.map((video) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { totalCount: _, ...videoWithoutCount } = video;
      return serializeVideo(videoWithoutCount);
    });

    logger.api('GET', '/api/youtube/videos', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({
      videos: serializedVideos,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'GET', '/api/youtube/videos', startTime);
  }
}
