import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

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
  confidence: number;
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
): Promise<T> {
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

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if it's a rate limit error or retryable error
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
        // Don't retry non-retryable errors
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );

      console.warn(
        `AI API call failed (attempt ${attempt + 1}/${
          maxRetries + 1
        }). Retrying in ${delay}ms...`,
        error instanceof Error ? error.message : error
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Validate that a category name is a legitimate, meaningful category
 */
export async function validateCategoryName(name: string): Promise<{
  valid: boolean;
  reason?: string;
  suggestion?: string;
}> {
  const result = await retryWithBackoff(
    () =>
      generateObject({
        model: openai('gpt-4o-mini'),
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
): Promise<CategorizationResult[]> {
  if (videos.length === 0 || categories.length === 0) {
    return [];
  }

  // Find the "Other" category for fallback
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
        model: openai('gpt-4o-mini'),
        schema: z.object({
          categorizations: z.array(
            z.object({
              videoId: z.string().describe('The video ID from the input'),
              categoryId: z
                .string()
                .describe('The category ID that best fits this video'),
              confidence: z
                .number()
                .min(0)
                .max(1)
                .describe('Confidence score from 0 to 1'),
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
- Assign a confidence score (0-1) based on how certain you are about the categorization

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
  videos: VideoForCategorization[],
  categories: Category[],
  batchSize: number = 10
): Promise<CategorizationResult[]> {
  const results: CategorizationResult[] = [];

  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize);
    const batchResults = await categorizeVideos(batch, categories);
    results.push(...batchResults);
  }

  return results;
}
