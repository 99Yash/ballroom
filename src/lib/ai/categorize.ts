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
 * Validate that a category name is a legitimate, meaningful category
 */
export async function validateCategoryName(name: string): Promise<{
  valid: boolean;
  reason?: string;
  suggestion?: string;
}> {
  const result = await generateObject({
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
  });

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

  const result = await generateObject({
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
  });

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
