import * as z from 'zod/v4';
import { createValidationError } from '~/lib/utils';

/**
 * API request validation schemas
 * Centralize all API input validation for consistency
 */

// Category schemas
export const createCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Category name must be at least 2 characters')
    .max(50, 'Category name must not exceed 50 characters')
    .trim(),
  skipValidation: z.boolean().optional().default(false),
});

export const updateCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Category name must be at least 2 characters')
    .max(50, 'Category name must not exceed 50 characters')
    .trim(),
});

// Video sync schemas
export const syncVideosSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(500, 'Limit cannot exceed 500')
    .optional()
    .default(100),
});

// Categorization schemas
export const categorizeVideosSchema = z.object({
  force: z.boolean().optional().default(false),
});

/**
 * Type-safe validation helper
 * Parses and validates request body, throwing AppError on failure
 */
export function validateRequestBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): z.infer<T> {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw createValidationError(result.error.issues);
  }

  return result.data;
}
