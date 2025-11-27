import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as z from 'zod/v4';
import {
  LOCAL_STORAGE_SCHEMAS,
  LocalStorageKey,
  LocalStorageValue,
} from './constants';
import { AppError } from './errors';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
export function createValidationError(issues: z.ZodIssue[]): AppError {
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
      console.error(
        `[LocalStorageError] Invalid value for key "${key}":`,
        validationResult.error.issues
      );
      return;
    }

    localStorage.setItem(key, JSON.stringify(validationResult.data));
  } catch (error) {
    console.error(
      `[LocalStorageError] Failed to set item for key "${key}":`,
      error
    );
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
  } catch {
    console.warn(`[LocalStorageError] Failed to parse value for key "${key}"`);
    return defaultValue !== undefined ? defaultValue : undefined;
  }

  const validationResult = schema.safeParse(parsedValue);
  if (validationResult.success) {
    return validationResult.data;
  }

  console.warn(
    `[LocalStorageValidation] Invalid data for key "${key}":`,
    validationResult.error.issues
  );

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
    console.error(
      `[LocalStorageError] Failed to remove item for key "${key}":`,
      error
    );
  }
}
