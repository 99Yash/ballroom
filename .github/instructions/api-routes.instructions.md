# API Route Code Review Instructions

## Standard API Route Pattern

All API routes must follow this structure:

```typescript
import { NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession(); // For protected routes

    // Route logic here...

    logger.api('GET', '/api/endpoint', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/endpoint', {
      duration: Date.now() - startTime,
      status: errorResponse.statusCode,
      error: error instanceof Error ? error : undefined,
    });
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
```

## Required Elements

### 1. Timing & Performance

- **Always** include `startTime = Date.now()` at the start
- **Always** log duration in both success and error cases
- This enables performance monitoring

### 2. Authentication

- Use `requireSession()` for protected routes (throws if not authenticated)
- Use `getSession()` only if route is optionally authenticated
- Never skip authentication checks

### 3. Error Handling

- **Always** wrap logic in try-catch
- Use `createErrorResponse()` for consistent error formatting
- Log errors with full context before responding
- Return proper HTTP status codes

### 4. Request Validation

- **Always** validate request bodies with Zod schemas
- Use `validateRequestBody()` from `~/lib/validations/api.ts`
- Parse query parameters safely (use `parseInt` with defaults)
- Validate limits/pagination parameters

### 5. Logging

- Use `logger.api()` for all API route logging
- Include: method, path, userId (if available), duration, status
- Include error object in error cases
- Never use `console.log`

### 6. Response Format

- Success: `NextResponse.json({ data: ... })` or `{ videos: ..., pagination: ... }`
- Error: `NextResponse.json({ error: string }, { status: number })`
- Use consistent response shapes across similar endpoints

## Common Issues to Flag

### Security

- ❌ Missing `requireSession()` in protected routes
- ❌ Exposing `userId` or other sensitive data in responses
- ❌ Not validating user ownership of resources
- ❌ Missing input validation

### Error Handling

- ❌ Not catching errors
- ❌ Not logging errors
- ❌ Returning generic error messages without context
- ❌ Not using `AppError` for typed errors

### Performance

- ❌ Missing timing measurements
- ❌ Unbounded queries (no pagination/limits)
- ❌ Not using database indexes effectively
- ❌ Missing pagination for list endpoints

### Code Quality

- ❌ Not following standard pattern
- ❌ Missing request validation
- ❌ Inconsistent response formats
- ❌ Not using path aliases (`~/`)

## Database Query Patterns

### User-Scoped Queries

```typescript
// ✅ Good: Always filter by userId
const videos = await db
  .select()
  .from(videos)
  .where(eq(videos.userId, session.user.id))
  .limit(limit)
  .offset(offset);

// ❌ Bad: Missing userId filter
const videos = await db.select().from(videos);
```

### Pagination

```typescript
// ✅ Good: Always use limits and offsets
const page = parseInt(searchParams.get('page') || '1', 10);
const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
const offset = (page - 1) * limit;

// ❌ Bad: No pagination
const allVideos = await db.select().from(videos);
```

### Explicit Column Selection

```typescript
// ✅ Good: Explicit columns
const result = await db
  .select({
    id: videos.id,
    title: videos.title,
    // ... explicit fields
  })
  .from(videos);

// ❌ Bad: SELECT *
// This is not possible with Drizzle, but verify no raw SQL uses SELECT *
```

## Request Body Validation

```typescript
// ✅ Good: Always validate
import {
  validateRequestBody,
  createCategorySchema,
} from '~/lib/validations/api';

const body = await request.json();
const { name } = validateRequestBody(createCategorySchema, body);

// ❌ Bad: No validation
const body = await request.json();
const name = body.name; // No validation!
```

## Response Serialization

```typescript
// ✅ Good: Serialize before sending
import { serializeVideo } from '~/types/video';

const serializedVideos = videos.map((v) => serializeVideo(v));
return NextResponse.json({ videos: serializedVideos });

// ❌ Bad: Sending raw database objects
return NextResponse.json({ videos }); // May include userId or other sensitive fields
```

## Query Parameter Parsing

```typescript
// ✅ Good: Safe parsing with defaults
const { searchParams } = new URL(request.url);
const page = parseInt(searchParams.get('page') || '1', 10);
const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
const categoryId = searchParams.get('categoryId'); // Can be null

// ❌ Bad: Unsafe parsing
const page = parseInt(searchParams.get('page')); // Could be NaN!
```

## Special Cases

### Public Routes (No Auth)

- Still use try-catch and error handling
- Still log with `logger.api()` (omit userId)
- Still validate inputs

### Webhook Routes

- May not need session authentication
- Still validate request signatures/headers
- Still use structured error handling

### Streaming Responses

- Still log start/end
- Handle errors gracefully
- Use proper streaming patterns
