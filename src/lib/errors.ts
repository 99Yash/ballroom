export const APP_ERROR_CODES_BY_KEY = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
} as const;

export type APP_ERROR_CODE_KEY = keyof typeof APP_ERROR_CODES_BY_KEY;

// User-friendly error messages for different error codes
export const ERROR_MESSAGES: Record<APP_ERROR_CODE_KEY, string> = {
  PARSE_ERROR:
    'Failed to parse request data. Please check your input and try again.',
  BAD_REQUEST: 'Invalid request. Please check your input and try again.',
  INTERNAL_SERVER_ERROR:
    'An internal server error occurred. Please try again later.',
  NOT_IMPLEMENTED: 'This feature is not yet implemented.',
  UNAUTHORIZED: 'You must be logged in to access this resource.',
  FORBIDDEN: 'You do not have permission to access this resource.',
  NOT_FOUND: 'The requested resource was not found.',
  METHOD_NOT_SUPPORTED: 'This HTTP method is not supported for this endpoint.',
  TIMEOUT: 'The request timed out. Please try again.',
  CONFLICT: 'This action conflicts with existing data.',
  PRECONDITION_FAILED: 'The request preconditions were not met.',
  PAYLOAD_TOO_LARGE: 'The request payload is too large.',
  UNPROCESSABLE_CONTENT: 'The request content could not be processed.',
  TOO_MANY_REQUESTS: 'Too many requests. Please wait before trying again.',
  CLIENT_CLOSED_REQUEST: 'The request was closed before completion.',
} as const;

export class AppError extends Error {
  public readonly code: APP_ERROR_CODE_KEY;
  public readonly cause?: unknown;

  constructor(opts: {
    message?: string;
    code: APP_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const message = opts.message ?? ERROR_MESSAGES[opts.code];

    super(message);

    this.code = opts.code;
    this.cause = opts.cause;
    this.name = 'AppError';
  }

  getStatusFromCode(): number {
    return APP_ERROR_CODES_BY_KEY[this.code];
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.getStatusFromCode(),
      cause: this.cause,
    };
  }
}

/**
 * Authentication error types for OAuth/token-related failures
 */
export const AUTH_ERROR_TYPES = {
  NO_ACCOUNT: 'no_account',
  NO_ACCESS_TOKEN: 'no_access_token',
  NO_REFRESH_TOKEN: 'no_refresh_token',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_REFRESH_FAILED: 'token_refresh_failed',
} as const;

export type AuthErrorType =
  (typeof AUTH_ERROR_TYPES)[keyof typeof AUTH_ERROR_TYPES];

/**
 * Specialized error for authentication/OAuth failures
 * Use this for errors that indicate the user needs to re-authenticate
 */
export class AuthenticationError extends AppError {
  public readonly authErrorType: AuthErrorType;

  constructor(opts: {
    message: string;
    authErrorType: AuthErrorType;
    cause?: unknown;
  }) {
    super({
      message: opts.message,
      code: 'UNAUTHORIZED',
      cause: opts.cause,
    });
    this.name = 'AuthenticationError';
    this.authErrorType = opts.authErrorType;
  }

  /**
   * Check if this error requires the user to re-authenticate
   * (as opposed to a temporary failure that might be retried)
   */
  requiresReauthentication(): boolean {
    const reauthTypes: AuthErrorType[] = [
      AUTH_ERROR_TYPES.NO_ACCOUNT,
      AUTH_ERROR_TYPES.NO_ACCESS_TOKEN,
      AUTH_ERROR_TYPES.NO_REFRESH_TOKEN,
    ];
    return reauthTypes.includes(this.authErrorType);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      authErrorType: this.authErrorType,
      requiresReauthentication: this.requiresReauthentication(),
    };
  }
}

/**
 * Helper function to create a standardized error response
 */
export function createErrorResponse(
  error: AppError | Error | unknown,
  fallbackCode: APP_ERROR_CODE_KEY = 'INTERNAL_SERVER_ERROR'
) {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.getStatusFromCode(),
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: fallbackCode,
      statusCode: APP_ERROR_CODES_BY_KEY[fallbackCode],
    };
  }

  return {
    message: ERROR_MESSAGES[fallbackCode],
    code: fallbackCode,
    statusCode: APP_ERROR_CODES_BY_KEY[fallbackCode],
  };
}
