import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { serializeVideo } from '~/types/video';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const uncategorized = searchParams.get('uncategorized') === 'true';
    const searchQuery = searchParams.get('search')?.trim();
    const baseConditions = [eq(videos.userId, session.user.id)];

    if (uncategorized) {
      baseConditions.push(isNull(videos.categoryId));
    } else if (categoryId) {
      baseConditions.push(eq(videos.categoryId, categoryId));
    }

    // Add search conditions if search query is provided
    if (searchQuery) {
      const searchPattern = `%${searchQuery}%`;
      // title is notNull, so at least one condition will always be valid
      baseConditions.push(
        or(
          ilike(videos.title, searchPattern),
          ilike(videos.description, searchPattern),
          ilike(videos.channelName, searchPattern)
        )
      );
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50', 10),
      100
    );
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(videos)
      .where(and(...baseConditions));

    const totalCount = countResult?.count || 0;

    // Fetch videos with only the fields we need (matches Video type)
    const userVideos = await db
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
      })
      .from(videos)
      .leftJoin(categories, eq(videos.categoryId, categories.id))
      .where(and(...baseConditions))
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .offset(offset);

    const serializedVideos = userVideos.map(serializeVideo);

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
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/youtube/videos', {
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
