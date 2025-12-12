import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { fetchAllLikedVideos } from '~/lib/youtube';
import { initializeDefaultCategories } from '../../categories/route';

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 100; // Default to 100 videos

    // Initialize default categories if needed
    await initializeDefaultCategories(session.user.id);

    // Fetch liked videos from YouTube
    const likedVideos = await fetchAllLikedVideos(session.user.id, limit);

    if (likedVideos.length === 0) {
      return NextResponse.json({
        synced: 0,
        new: 0,
        total: 0,
        message: 'No liked videos found',
      });
    }

    // Get existing videos to avoid duplicates
    const existingVideos = await db
      .select({ youtubeId: videos.youtubeId })
      .from(videos)
      .where(
        and(
          eq(videos.userId, session.user.id),
          inArray(
            videos.youtubeId,
            likedVideos.map((v) => v.youtubeId)
          )
        )
      );

    const existingIds = new Set(existingVideos.map((v) => v.youtubeId));

    // Filter to only new videos
    const newVideos = likedVideos.filter((v) => !existingIds.has(v.youtubeId));

    // Insert new videos
    if (newVideos.length > 0) {
      await db.insert(videos).values(
        newVideos.map((v) => ({
          userId: session.user.id,
          youtubeId: v.youtubeId,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          channelName: v.channelName,
          channelId: v.channelId,
          publishedAt: v.publishedAt,
        }))
      );
    }

    return NextResponse.json({
      synced: likedVideos.length,
      new: newVideos.length,
      existing: existingIds.size,
      message: `Synced ${newVideos.length} new videos`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error syncing videos:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync videos',
      },
      { status: 500 }
    );
  }
}
