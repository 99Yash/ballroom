import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import * as z from 'zod/v4';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { VIDEO_SYNC_STATUS } from '~/lib/constants';
import { AppError } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { reserveQuota } from '~/lib/quota';

interface VideoForCategorization {
  id: string;
  title: string;
  description?: string | null;
  channelName?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface CategorizationResult {
  videoId: string;
  categoryId: string;
}

interface CategorizationWithReasoning extends CategorizationResult {
  contentType: 'entertainment' | 'educational' | 'music' | 'news' | 'other';
  reasoning: string;
}

const contentTypeEnum = z.enum([
  'entertainment',
  'educational',
  'music',
  'news',
  'other',
]);

const categorizationSchema = z.object({
  categorizations: z.array(
    z.object({
      videoId: z.string(),
      contentType: contentTypeEnum.describe(
        'The primary content type/format of this video'
      ),
      reasoning: z
        .string()
        .describe(
          'Brief explanation of why this category was chosen over others'
        ),
      categoryId: z.string().describe('The final category ID assignment'),
    })
  ),
});

/**
 * Retry a function with exponential backoff
 * Useful for handling rate limits and transient failures
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  } = {}
) {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const isRateLimitError =
        error instanceof Error &&
        (error.message.includes('rate limit') ||
          error.message.includes('429') ||
          error.message.includes('quota'));

      const isRetryableError =
        error instanceof Error &&
        (error.message.includes('timeout') ||
          error.message.includes('network') ||
          error.message.includes('ECONNRESET'));

      if (!isRateLimitError && !isRetryableError) {
        throw error;
      }

      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );

      logger.warn(
        `AI API call failed (attempt ${attempt + 1}/${
          maxRetries + 1
        }). Retrying in ${delay}ms...`,
        {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          delay,
          error: error instanceof Error ? error.message : error,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Validate that a category name is a legitimate, meaningful category
 */
export async function validateCategoryName(name: string) {
  const result = await retryWithBackoff(
    () =>
      generateObject({
        model: google('gemini-2.5-flash-lite'),
        schema: z.object({
          valid: z
            .boolean()
            .describe('Whether the category name is valid and meaningful'),
          reason: z.string().optional().describe('Reason if invalid'),
          suggestion: z
            .string()
            .optional()
            .describe(
              'Suggested alternative if the name is close but not quite right'
            ),
        }),
        prompt: `Evaluate if this is a valid category name for organizing YouTube videos: "${name}"

A valid category should be:
- A real English word or commonly understood phrase
- Suitable for categorizing video content (like "Music", "Gaming", "Tech", "Cooking", etc.)
- Not gibberish, offensive, or nonsensical
- Not too specific (like a person's name) unless it's a well-known content type
- Not too vague to be useful

Return whether it's valid, and if not, explain why and suggest an alternative if possible.`,
      }),
    { maxRetries: 2 }
  );

  return result.object;
}

/**
 * Categorize a batch of videos into the provided categories.
 * Uses chain-of-thought reasoning to improve accuracy by having the AI
 * first identify content type before assigning a category.
 */
export async function categorizeVideos(
  videosToCateg: VideoForCategorization[],
  categoriesToUse: Category[]
): Promise<CategorizationResult[]> {
  if (videosToCateg.length === 0 || categoriesToUse.length === 0) {
    return [];
  }

  const otherCategory = categoriesToUse.find(
    (c) => c.name.toLowerCase() === 'other'
  );

  const categoryList = categoriesToUse
    .map((c) => `- "${c.name}" (ID: ${c.id})`)
    .join('\n');

  const videoList = videosToCateg
    .map(
      (v) =>
        `- Video ID: ${v.id}
  Title: "${v.title}"
  Channel: ${v.channelName || 'Unknown'}
  Description: ${v.description?.slice(0, 200) || 'No description'}`
    )
    .join('\n\n');

  const result = await retryWithBackoff(
    () =>
      generateObject({
        model: google('gemini-2.5-flash-lite'),
        schema: categorizationSchema,
        prompt: `You are categorizing YouTube videos into user-defined categories.

CATEGORIES:
${categoryList}

VIDEOS TO CATEGORIZE:
${videoList}

## Categorization Process

For each video, follow this reasoning process:

1. **First, identify the content type** (entertainment, educational, music, news, other)
   - entertainment: Comedy, vlogs, reaction videos, podcasts, gaming, talk shows
   - educational: Tutorials, how-to guides, lectures, documentaries, explainers
   - music: Music videos, live performances, album reviews, artist content
   - news: Current events, journalism, updates, announcements
   - other: Doesn't fit the above

2. **Then, consider what category fits best** based on these rules:

**CRITICAL: Content TYPE trumps topic MENTIONED**

Categories can represent either:
- **Content format/type** (Comedy, Entertainment, Music, Podcast, Gaming) - WHAT KIND of content
- **Subject/niche** (Fitness, Tech, Cooking, Finance) - WHAT TOPIC it covers

**Priority hierarchy:**

1. **Creator/Channel type** - Is this channel primarily known for comedy, music, gaming, etc.?
   - Comedians (Bill Burr, Dave Chappelle, Joe Rogan clips, etc.) → Comedy/Entertainment
   - Musicians, music channels → Music
   - Gaming streamers/YouTubers → Gaming
   - Podcasts → Podcast/Entertainment

2. **Primary purpose** - What is the viewer supposed to get from this?
   - Laughing/entertainment → Comedy/Entertainment
   - Learning how to do something → Education or the topic category
   - Background listening/watching → Music, Podcast, Entertainment

3. **Topic mentioned** - Only use topic categories when:
   - The video is instructional/educational about that topic
   - The channel specializes in that topic
   - The primary purpose is to inform/teach about that topic

**Examples:**
- Bill Burr rant about the gym → contentType: "entertainment", category: Comedy (NOT Fitness)
- AthleanX workout tutorial → contentType: "educational", category: Fitness
- Joe Rogan discussing nutrition → contentType: "entertainment", category: Entertainment/Podcast
- MKBHD phone review → contentType: "educational", category: Tech
- Music video → contentType: "music", category: Music
- Gaming streamer cooking in a game → contentType: "entertainment", category: Gaming

**Rules:**
- Every video MUST be assigned to exactly one category
- Use the category ID (not name) in your response
- Provide brief reasoning explaining your choice
- If nothing fits well, use "Other"${otherCategory ? ` (ID: ${otherCategory.id})` : ''}

Return a categorization for EVERY video.`,
      }),
    { maxRetries: 3 }
  );

  const categorizations = result.object
    .categorizations as CategorizationWithReasoning[];

  logger.debug('AI categorization reasoning', {
    count: categorizations.length,
    sample: categorizations.slice(0, 3).map((c) => ({
      videoId: c.videoId,
      contentType: c.contentType,
      reasoning: c.reasoning,
    })),
  });

  return categorizations.map(({ videoId, categoryId }) => ({
    videoId,
    categoryId,
  }));
}

/**
 * Process videos in batches to avoid token limits
 */
export async function categorizeVideosInBatches(
  videosToProcess: VideoForCategorization[],
  categoriesToUse: Category[],
  batchSize: number = 10
) {
  const results: CategorizationResult[] = [];

  for (let i = 0; i < videosToProcess.length; i += batchSize) {
    const batch = videosToProcess.slice(i, i + batchSize);
    const batchResults = await categorizeVideos(batch, categoriesToUse);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Result of categorizing user videos
 */
export interface CategorizeResult {
  categorized: number;
  total: number;
  skipped: number;
}

/**
 * Build the where condition for videos that need categorization
 * This is extracted to avoid duplicating the logic between count and select queries
 */
function buildVideosToAnalyzeCondition(
  userId: string,
  force: boolean,
  latestCategoryUpdate: Date | null
) {
  const baseCondition = and(
    eq(videos.userId, userId),
    eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE)
  );

  if (force) {
    return baseCondition;
  }

  if (latestCategoryUpdate === null) {
    return and(
      baseCondition,
      or(isNull(videos.categoryId), isNull(videos.lastAnalyzedAt))
    );
  }

  return and(
    baseCondition,
    or(
      isNull(videos.categoryId),
      isNull(videos.lastAnalyzedAt),
      lt(videos.lastAnalyzedAt, latestCategoryUpdate)
    )
  );
}

/**
 * Categorize all uncategorized videos for a user
 * This is a reusable function that can be called from API routes or background jobs
 */
export async function categorizeUserVideos(
  userId: string,
  force: boolean = false
) {
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  if (userCategories.length === 0) {
    logger.warn('No categories found for user', { userId });
    return { categorized: 0, total: 0, skipped: 0 };
  }

  const latestCategoryUpdate = userCategories.reduce<Date | null>(
    (latest, category) => {
      const updatedAt = category.updatedAt;
      if (!updatedAt) return latest;
      if (latest === null) return updatedAt;
      return updatedAt > latest ? updatedAt : latest;
    },
    null
  );

  const whereCondition = buildVideosToAnalyzeCondition(
    userId,
    force,
    latestCategoryUpdate
  );

  const videosToAnalyze = await db.select().from(videos).where(whereCondition);

  if (videosToAnalyze.length === 0) {
    return { categorized: 0, total: 0, skipped: 0 };
  }

  // Reserve quota atomically BEFORE expensive AI work.
  // This prevents concurrent requests from both passing optimistic checks
  // and wasting AI API calls on operations that would fail at commit time.
  // Once reserved, quota is consumed regardless of AI success (fair since API is called).
  const reservation = await reserveQuota(
    userId,
    'categorize',
    videosToAnalyze.length
  );

  logger.debug('Quota reserved for categorization', {
    userId,
    videosToAnalyze: videosToAnalyze.length,
    newUsed: reservation.newUsed,
    limit: reservation.limit,
  });

  if (force) {
    logger.info('Force re-categorization requested', {
      userId,
      totalVideos: videosToAnalyze.length,
    });
  }

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
    10
  );

  const validCategoryIds = new Set(userCategories.map((c) => c.id));
  const videoIdsSet = new Set(videosToAnalyze.map((v) => v.id));

  const invalidCategorizations = categorizations.filter(
    (c) => !validCategoryIds.has(c.categoryId)
  );

  const missingVideoIds = categorizations.filter(
    (c) => !videoIdsSet.has(c.videoId)
  );

  const categorizedVideoIds = new Set(categorizations.map((c) => c.videoId));
  const uncategorizedVideoIds = videosToAnalyze.filter(
    (v) => !categorizedVideoIds.has(v.id)
  );

  if (invalidCategorizations.length > 0) {
    logger.warn('AI returned invalid category IDs', {
      userId,
      invalidCount: invalidCategorizations.length,
      invalidCategoryIds: invalidCategorizations.map((c) => c.categoryId),
    });
  }

  if (missingVideoIds.length > 0) {
    logger.warn('AI returned categorizations for unknown video IDs', {
      userId,
      missingCount: missingVideoIds.length,
    });
  }

  if (uncategorizedVideoIds.length > 0) {
    logger.warn('Some videos were not categorized by AI', {
      userId,
      uncategorizedCount: uncategorizedVideoIds.length,
      uncategorizedVideoIds: uncategorizedVideoIds.map((v) => v.id),
    });
  }

  const categorizationMap = new Map(
    categorizations
      .filter(
        (c) => validCategoryIds.has(c.categoryId) && videoIdsSet.has(c.videoId)
      )
      .map((c) => [c.videoId, c.categoryId])
  );

  const now = new Date();
  let categorizedCount = 0;

  await db.transaction(async (tx) => {
    const updatesByCategory = new Map<string, string[]>();
    const videosWithoutCategory: string[] = [];

    for (const video of videosToAnalyze) {
      const categoryId = categorizationMap.get(video.id);
      if (categoryId) {
        if (!updatesByCategory.has(categoryId)) {
          updatesByCategory.set(categoryId, []);
        }
        updatesByCategory.get(categoryId)!.push(video.id);
      } else {
        videosWithoutCategory.push(video.id);
      }
    }

    const updatePromises: Promise<unknown>[] = [];

    for (const [categoryId, videoIds] of updatesByCategory) {
      const chunkSize = 1000;
      for (let i = 0; i < videoIds.length; i += chunkSize) {
        const chunk = videoIds.slice(i, i + chunkSize);
        updatePromises.push(
          tx
            .update(videos)
            .set({ categoryId, lastAnalyzedAt: now })
            .where(inArray(videos.id, chunk))
        );
      }
    }

    if (videosWithoutCategory.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < videosWithoutCategory.length; i += chunkSize) {
        const chunk = videosWithoutCategory.slice(i, i + chunkSize);
        updatePromises.push(
          tx
            .update(videos)
            .set({ lastAnalyzedAt: now })
            .where(inArray(videos.id, chunk))
        );
      }
    }

    await Promise.all(updatePromises);

    categorizedCount = Array.from(updatesByCategory.values()).reduce(
      (sum, videoIds) => sum + videoIds.length,
      0
    );

    // Note: Quota was already reserved before AI work started.
    // No additional quota increment needed here.
  });

  logger.info('Categorized user videos', {
    userId,
    categorized: categorizedCount,
    total: videosToAnalyze.length,
    skipped: videosToAnalyze.length - categorizedCount,
  });

  return {
    categorized: categorizedCount,
    total: videosToAnalyze.length,
    skipped: videosToAnalyze.length - categorizedCount,
  };
}
