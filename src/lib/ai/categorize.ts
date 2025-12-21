import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import * as z from 'zod/v4';
import { db } from '~/db';
import { categories, DatabaseVideo, videos } from '~/db/schemas';
import { logger } from '~/lib/logger';

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
 * Categorize a batch of videos into the provided categories
 */
export async function categorizeVideos(
  videos: VideoForCategorization[],
  categories: Category[]
) {
  if (videos.length === 0 || categories.length === 0) {
    return [];
  }

  const otherCategory = categories.find(
    (c) => c.name.toLowerCase() === 'other'
  );

  const categoryList = categories
    .map((c) => `- "${c.name}" (ID: ${c.id})`)
    .join('\n');

  const videoList = videos
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
        schema: z.object({
          categorizations: z.array(
            z.object({
              videoId: z.string().describe('The video ID from the input'),
              categoryId: z
                .string()
                .describe('The category ID that best fits this video'),
            })
          ),
        }),
        prompt: `You are categorizing YouTube videos into user-defined categories.

CATEGORIES:
${categoryList}

VIDEOS TO CATEGORIZE:
${videoList}

For each video, determine the most appropriate category based on:
1. The video title
2. The channel name
3. The video description (if available)

Rules:
- Every video MUST be assigned to exactly one category
- Use the category ID (not name) in your response
- If a video doesn't clearly fit any category, use the "Other" category${
          otherCategory ? ` (ID: ${otherCategory.id})` : ''
        }

Return a categorization for EVERY video in the input.`,
      }),
    { maxRetries: 3 }
  );

  return result.object.categorizations;
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
 * Categorize all uncategorized videos for a user
 * This is a reusable function that can be called from API routes or background jobs
 */
export async function categorizeUserVideos(
  userId: string,
  force: boolean = false
) {
  // Get user's categories
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  if (userCategories.length === 0) {
    logger.warn('No categories found for user', { userId });
    return { categorized: 0, total: 0, skipped: 0 };
  }

  const latestCategoryUpdate = userCategories.reduce((latest, category) => {
    const updatedAt = category.updatedAt;
    if (!updatedAt) return latest;
    return updatedAt > latest ? updatedAt : latest;
  }, new Date(0));

  let videosToAnalyze: DatabaseVideo[] = [];

  if (force) {
    // Force mode: re-analyze ALL videos (use with caution)
    videosToAnalyze = await db
      .select()
      .from(videos)
      .where(eq(videos.userId, userId));

    logger.info('Force re-categorization requested', {
      userId,
      totalVideos: videosToAnalyze.length,
    });
  } else {
    videosToAnalyze = await db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.userId, userId),
          or(
            isNull(videos.categoryId),
            isNull(videos.lastAnalyzedAt),
            lt(videos.lastAnalyzedAt, latestCategoryUpdate)
          )
        )
      );
  }

  if (videosToAnalyze.length === 0) {
    return { categorized: 0, total: 0, skipped: 0 };
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
  const invalidCategorizations = categorizations.filter(
    (c) => !validCategoryIds.has(c.categoryId)
  );

  if (invalidCategorizations.length > 0) {
    logger.warn('AI returned invalid category IDs', {
      userId,
      invalidCount: invalidCategorizations.length,
    });
  }

  const categorizationMap = new Map(
    categorizations
      .filter((c) => validCategoryIds.has(c.categoryId))
      .map((c) => [c.videoId, c.categoryId])
  );

  const now = new Date();
  let categorizedCount = 0;

  await db.transaction(async (tx) => {
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
        uncategorizedVideoIds.push(video.id);
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
      categorizedCount += videoIds.length;
    }

    if (uncategorizedVideoIds.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < uncategorizedVideoIds.length; i += chunkSize) {
        const chunk = uncategorizedVideoIds.slice(i, i + chunkSize);
        updatePromises.push(
          tx
            .update(videos)
            .set({ lastAnalyzedAt: now })
            .where(inArray(videos.id, chunk))
        );
      }
    }

    await Promise.all(updatePromises);
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
