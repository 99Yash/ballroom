import { sql, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { createErrorResponse } from './errors';
import { logger } from './logger';

/**
 * Standard API error handler — replaces the duplicated catch block pattern
 * used across all route handlers.
 */
export function handleApiError(
  error: unknown,
  method: string,
  path: string,
  startTime: number
): NextResponse {
  const errorResponse = createErrorResponse(error);
  logger.api(method, path, {
    duration: Date.now() - startTime,
    status: errorResponse.statusCode,
    error: error instanceof Error ? error : undefined,
  });
  return NextResponse.json(
    { error: errorResponse.message },
    { status: errorResponse.statusCode }
  );
}

/**
 * Parse and validate pagination parameters from URL search params.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  opts?: { defaultLimit?: number; maxLimit?: number }
): { page: number; limit: number; offset: number } {
  const defaultLimit = opts?.defaultLimit ?? 50;
  const maxLimit = opts?.maxLimit ?? 100;

  const rawPage = Number(searchParams.get('page') ?? '1');
  const rawLimit = Number(searchParams.get('limit') ?? String(defaultLimit));
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit = Math.min(
    maxLimit,
    Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : defaultLimit
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

const MAX_SEARCH_QUERY_LENGTH = 300;

/**
 * Validate and trim a search query from URL params.
 * Returns the trimmed query, or null if absent/empty.
 * Sets `errorResponse` when validation fails (caller should return it early).
 */
export function validateSearchQuery(searchParams: URLSearchParams): {
  query: string | null;
  errorResponse?: NextResponse;
} {
  const raw = searchParams.get('search');
  if (!raw) return { query: null };

  if (raw.length > MAX_SEARCH_QUERY_LENGTH) {
    return {
      query: null,
      errorResponse: NextResponse.json(
        {
          error: `Search query is too long. Maximum length is ${MAX_SEARCH_QUERY_LENGTH} characters.`,
        },
        { status: 400 }
      ),
    };
  }

  const trimmed = raw.trim();
  return { query: trimmed.length > 0 ? trimmed : null };
}

/**
 * Build a prefix-matching tsquery from a search string.
 * Splits on whitespace, escapes special characters, and appends :* for prefix matching.
 */
export function buildPrefixTsquery(searchQuery: string): SQL {
  const words = searchQuery
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => {
      const escaped = w.replace(/([&|!():\\])/g, '\\$1');
      return escaped.length > 0 ? `${escaped}:*` : '';
    })
    .filter((w) => w.length > 0)
    .join(' & ');

  return words.length > 0
    ? sql`to_tsquery('simple', ${words})`
    : sql`plainto_tsquery('simple', ${searchQuery})`;
}
