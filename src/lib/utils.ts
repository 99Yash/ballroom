import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as z from 'zod/v4';
import {
  LOCAL_STORAGE_SCHEMAS,
  LocalStorageKey,
  LocalStorageValue,
} from './constants';
import { AppError } from './errors';
import { logger } from './logger';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// Generic Serialization Utilities
// ============================================================================

/**
 * Type-level transformation: converts Date types to string recursively.
 * Handles nullability, optionality, arrays, and nested objects.
 *
 * @example
 * type Input = { createdAt: Date; name: string; tags: Date[] };
 * type Output = Serialize<Input>;
 * // { createdAt: string; name: string; tags: string[] }
 */
export type Serialize<T> = T extends Date
  ? string
  : T extends Array<infer U>
  ? Array<Serialize<U>>
  : T extends object
  ? { [K in keyof T]: Serialize<T[K]> }
  : T;

/**
 * Serializes a value for JSON/client transport.
 * Recursively converts Date objects to ISO 8601 strings.
 * Preserves full type safety through generics.
 *
 * @example
 * const video = { id: '1', publishedAt: new Date(), title: 'Test' };
 * const serialized = serialize(video);
 * // { id: '1', publishedAt: '2024-12-13T...', title: 'Test' }
 * // Type: { id: string; publishedAt: string; title: string }
 */
export function serialize<T>(value: T): Serialize<T> {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value as Serialize<T>;
  }

  // Handle Date
  if (value instanceof Date) {
    return value.toISOString() as Serialize<T>;
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    return value.map((item) => serialize(item)) as Serialize<T>;
  }

  // Handle Objects (but not special types like RegExp, Map, etc.)
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = serialize((value as Record<string, unknown>)[key]);
      }
    }
    return result as Serialize<T>;
  }

  // Primitives pass through unchanged
  return value as Serialize<T>;
}

export const unknownError = 'Something went wrong. Please try again.';

/**
 * Enhanced error message extraction that handles AppError instances
 */
export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') {
    return err;
  } else if (err instanceof AppError) {
    return err.message;
  } else if (err instanceof z.ZodError) {
    return err.issues.map((e) => e.message).join(', ') ?? unknownError;
  } else if (err instanceof Error) {
    return err.message;
  } else {
    return unknownError;
  }
}

/**
 * Creates a standardized validation error from Zod issues
 */
export function createValidationError(issues: z.core.$ZodIssue[]): AppError {
  const message = issues.map((issue) => issue.message).join(', ');
  return new AppError({
    code: 'UNPROCESSABLE_CONTENT',
    message: `Validation error: ${message}`,
  });
}

/**
 * Creates a standardized database error
 */
export function createDatabaseError(
  message?: string,
  cause?: unknown
): AppError {
  return new AppError({
    code: 'INTERNAL_SERVER_ERROR',
    message: message ?? 'Database operation failed',
    cause,
  });
}

/**
 * Creates a standardized authentication error
 */
export function createAuthError(message?: string): AppError {
  return new AppError({
    code: 'UNAUTHORIZED',
    message: message ?? 'Authentication required',
  });
}

/**
 * Creates a standardized conflict error (e.g., duplicate data)
 */
export function createConflictError(
  message?: string,
  cause?: unknown
): AppError {
  return new AppError({
    code: 'CONFLICT',
    message: message ?? 'Resource already exists',
    cause,
  });
}

/**
 * Creates a standardized external service error (e.g., scraping, AI service)
 */
export function createExternalServiceError(
  service: string,
  message?: string,
  cause?: unknown
): AppError {
  return new AppError({
    code: 'INTERNAL_SERVER_ERROR',
    message: message ?? `${service} service unavailable`,
    cause,
  });
}

export function setLocalStorageItem<K extends LocalStorageKey>(
  key: K,
  value: LocalStorageValue<K>
): void {
  try {
    const schema = LOCAL_STORAGE_SCHEMAS[key];
    const validationResult = schema.safeParse(value);

    if (!validationResult.success) {
      logger.error('Invalid value for LocalStorage key', undefined, {
        key,
        issues: validationResult.error.issues,
      });
      return;
    }

    localStorage.setItem(key, JSON.stringify(validationResult.data));
  } catch (error) {
    logger.error('Failed to set LocalStorage item', error, { key });
  }
}

export function getLocalStorageItem<K extends LocalStorageKey>(
  key: K,
  defaultValue?: LocalStorageValue<K>
): LocalStorageValue<K> | undefined {
  const schema = LOCAL_STORAGE_SCHEMAS[key];
  const serializedValue = localStorage.getItem(key);

  if (serializedValue === null) {
    if (defaultValue !== undefined) {
      const defaultResult = schema.safeParse(defaultValue);
      return defaultResult.success ? defaultResult.data : undefined;
    }
    const schemaDefaultResult = schema.safeParse(undefined);
    return schemaDefaultResult.success ? schemaDefaultResult.data : undefined;
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(serializedValue);
  } catch (error) {
    logger.warn('Failed to parse LocalStorage value', { key, error });
    return defaultValue !== undefined ? defaultValue : undefined;
  }

  const validationResult = schema.safeParse(parsedValue);
  if (validationResult.success) {
    return validationResult.data;
  }

  logger.warn('Invalid data in LocalStorage', {
    key,
    issues: validationResult.error.issues,
  });

  if (defaultValue !== undefined) {
    const defaultResult = schema.safeParse(defaultValue);
    return defaultResult.success ? defaultResult.data : undefined;
  }

  const schemaDefaultResult = schema.safeParse(undefined);
  return schemaDefaultResult.success ? schemaDefaultResult.data : undefined;
}

export function removeLocalStorageItem(key: LocalStorageKey): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    logger.error('Failed to remove LocalStorage item', error, { key });
  }
}
