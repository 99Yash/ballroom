import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { categorizeVideosInBatches } from '~/lib/ai/categorize';
import { requireSession } from '~/lib/auth/session';

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    // Get user's categories
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, session.user.id));

    if (userCategories.length === 0) {
      return NextResponse.json(
        { error: 'No categories found. Please create some categories first.' },
        { status: 400 }
      );
    }

    // Get the most recent category update time
    const latestCategoryUpdate = userCategories.reduce((latest, cat) => {
      const catTime = cat.updatedAt?.getTime() || cat.createdAt.getTime();
      return catTime > latest ? catTime : latest;
    }, 0);

    // Get videos that need categorization
    // - No category assigned OR
    // - Last analyzed before categories were updated OR
    // - Force recategorization
    let videosToAnalyze;

    if (force) {
      videosToAnalyze = await db
        .select()
        .from(videos)
        .where(eq(videos.userId, session.user.id));
    } else {
      videosToAnalyze = await db
        .select()
        .from(videos)
        .where(
          and(
            eq(videos.userId, session.user.id),
            or(
              isNull(videos.categoryId),
              isNull(videos.lastAnalyzedAt),
              lt(videos.lastAnalyzedAt, new Date(latestCategoryUpdate))
            )
          )
        );
    }

    if (videosToAnalyze.length === 0) {
      return NextResponse.json({
        categorized: 0,
        message: 'All videos are already categorized',
      });
    }

    // Categorize videos using AI
    const categorizations = await categorizeVideosInBatches(
      videosToAnalyze.map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description,
        channelName: v.channelName,
      })),
      userCategories.map((c) => ({
        id: c.id,
        name: c.name,
      })),
      10 // Batch size
    );

    // Create a map for quick lookup, filtering out invalid category IDs
    const validCategoryIds = new Set(userCategories.map((c) => c.id));
    const invalidCategorizations = categorizations.filter(
      (c) => !validCategoryIds.has(c.categoryId)
    );

    if (invalidCategorizations.length > 0) {
      console.warn(
        'AI returned invalid category IDs:',
        invalidCategorizations.map((c) => ({
          videoId: c.videoId,
          invalidCategoryId: c.categoryId,
        }))
      );
    }

    const categorizationMap = new Map(
      categorizations
        .filter((c) => validCategoryIds.has(c.categoryId))
        .map((c) => [c.videoId, c.categoryId])
    );

    // Update videos with their categories
    const now = new Date();
    let categorizedCount = 0;

    await db.transaction(async (tx) => {
      // Group videos by category for batch updates
      const updatesByCategory = new Map<string, string[]>();
      const uncategorizedVideoIds: string[] = [];

      for (const video of videosToAnalyze) {
        const categoryId = categorizationMap.get(video.id);
        if (categoryId) {
          if (!updatesByCategory.has(categoryId)) {
            updatesByCategory.set(categoryId, []);
          }
          updatesByCategory.get(categoryId)!.push(video.id);
        } else {
          // Track videos that couldn't be categorized
          uncategorizedVideoIds.push(video.id);
        }
      }

      // Update successfully categorized videos
      for (const [categoryId, videoIds] of updatesByCategory) {
        await tx
          .update(videos)
          .set({ categoryId, lastAnalyzedAt: now })
          .where(inArray(videos.id, videoIds));
        categorizedCount += videoIds.length;
      }

      // Update lastAnalyzedAt for failed videos too, to avoid infinite retries
      // This prevents wasting API calls on videos that consistently fail
      if (uncategorizedVideoIds.length > 0) {
        await tx
          .update(videos)
          .set({ lastAnalyzedAt: now })
          .where(inArray(videos.id, uncategorizedVideoIds));
      }
    });

    return NextResponse.json({
      categorized: categorizedCount,
      total: videosToAnalyze.length,
      skipped: videosToAnalyze.length - categorizedCount,
      message: `Categorized ${categorizedCount} of ${videosToAnalyze.length} videos`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error categorizing videos:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to categorize videos',
      },
      { status: 500 }
    );
  }
}
