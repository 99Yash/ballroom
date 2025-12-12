import { and, desc, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const uncategorized = searchParams.get('uncategorized') === 'true';
    const baseConditions = [eq(videos.userId, session.user.id)];

    if (uncategorized) {
      baseConditions.push(isNull(videos.categoryId));
    } else if (categoryId) {
      baseConditions.push(eq(videos.categoryId, categoryId));
    }

    const userVideos = await db
      .select({
        id: videos.id,
        youtubeId: videos.youtubeId,
        title: videos.title,
        description: videos.description,
        thumbnailUrl: videos.thumbnailUrl,
        channelName: videos.channelName,
        channelId: videos.channelId,
        publishedAt: videos.publishedAt,
        categoryId: videos.categoryId,
        lastAnalyzedAt: videos.lastAnalyzedAt,
        createdAt: videos.createdAt,
        categoryName: categories.name,
      })
      .from(videos)
      .leftJoin(categories, eq(videos.categoryId, categories.id))
      .where(and(...baseConditions))
      .orderBy(desc(videos.createdAt));

    return NextResponse.json({ videos: userVideos });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}
