# Copilot Code Review Instructions

## General Code Quality

### Comments & Documentation

- **Remove redundant/trivial AI-generated comments** that just restate what the code does
  - ❌ Bad: `// Get the user ID from the session`
  - ✅ Good: Only comment when explaining "why", not "what"
- Keep JSDoc comments for public APIs, complex algorithms, or non-obvious business logic
- Remove comments that duplicate TypeScript type information

### TypeScript & Type Safety

- **Never use `any` types** - use `unknown` and type guards if needed
- Prefer explicit return types for functions, especially in API routes
- Use type inference only when types are obvious from context
- Ensure all database queries are properly typed with Drizzle ORM

### Imports & Path Aliases

- **Always use `~/` path alias** for imports from `src/`, never relative paths like `../../../`
- Group imports: external packages first, then internal modules
- Use `import * as z from "zod/v4"` pattern (not `import { z } from "zod/v4"`)

### Error Handling

- **Always use `AppError` class** for application errors, never throw plain `Error`
- Use `createErrorResponse()` helper in API routes for consistent error responses
- Include proper error codes from `APP_ERROR_CODES_BY_KEY`
- Log errors with structured logger before returning error responses

### Logging

- **Never use `console.log`** - use the structured `logger` from `~/lib/logger`
- Use appropriate log levels: `debug`, `info`, `warn`, `error`
- Include relevant context in log calls (userId, duration, etc.)
- Use `logger.api()` for API route logging with timing

### Code Patterns

- Prefer Server Components by default, use `'use client'` only when necessary
- Use `cn()` utility for conditional className composition
- Follow existing patterns for API routes, database queries, and component structure

## Security & Data Privacy

### User Data Protection

- **Never expose `userId` or sensitive fields** in client-facing responses
- Always use `requireSession()` for protected API routes
- Use `serializeVideo()` or similar serialization helpers before sending data to client
- Validate all user inputs with Zod schemas from `~/lib/validations/api.ts`

### Database Queries

- Never use `SELECT *` - always specify explicit columns
- Always filter by `userId` for user-scoped queries
- Use parameterized queries (Drizzle handles this, but verify no raw SQL injection risks)

## Performance

### Database

- Check for unbounded queries - always use pagination or limits
- Verify indexes are used for filtered/sorted columns
- Use window functions for counts when possible (see existing video query pattern)

### API Routes

- Include timing measurements (`startTime` pattern) for performance monitoring
- Use appropriate HTTP status codes
- Return paginated results for list endpoints

## Code Organization

### File Structure

- Follow existing directory structure patterns
- Keep API routes in `src/app/api/`
- Keep database schemas in `src/db/schemas/`
- Keep validation schemas in `~/lib/validations/api.ts`

### Naming Conventions

- Use camelCase for variables and functions
- Use PascalCase for components and types
- Use SCREAMING_SNAKE_CASE for constants
- Use kebab-case for file names (except React components which use PascalCase)

## Testing & Validation

### Input Validation

- Always validate request bodies with Zod schemas
- Use `validateRequestBody()` helper for type-safe validation
- Return appropriate error messages for validation failures

### Error Responses

- Use consistent error response format: `{ error: string }`
- Include proper HTTP status codes
- Log errors with full context before responding

## AI-Specific Patterns

### Categorization

- When working with AI categorization, ensure proper error handling for API failures
- Use retry logic for transient AI API failures
- Validate category names before saving to database

### YouTube Integration

- Handle OAuth token refresh failures gracefully
- Use `AuthenticationError` for auth-related failures
- Check for rate limiting and handle appropriately

## Common Mistakes to Flag

1. ❌ Using relative imports instead of `~/` alias
2. ❌ Using `console.log` instead of `logger`
3. ❌ Throwing plain `Error` instead of `AppError`
4. ❌ Exposing `userId` in API responses
5. ❌ Missing `requireSession()` in protected routes
6. ❌ Unbounded database queries without limits
7. ❌ Using `any` types
8. ❌ Missing error handling in try-catch blocks
9. ❌ Not using Zod validation for request bodies
10. ❌ Redundant comments that restate code

## Positive Patterns to Encourage

1. ✅ Proper use of `AppError` with error codes
2. ✅ Structured logging with context
3. ✅ Type-safe database queries with Drizzle
4. ✅ Proper serialization before sending to client
5. ✅ Consistent API route error handling pattern
6. ✅ Proper use of path aliases
7. ✅ Input validation with Zod
8. ✅ Performance monitoring with timing
9. ✅ Clear, purposeful comments explaining "why"
10. ✅ Proper TypeScript types throughout
