# Database Schema & Query Code Review Instructions

## Schema Definitions

### Table Structure

- Use `pgTable()` from Drizzle ORM
- Always include `lifecycle_dates` for created/updated timestamps
- Use `createId()` helper for ID generation with prefixes (`vid_`, `cat_`, etc.)
- Define proper foreign key relationships with `references()`

### Indexes

- Add indexes for frequently queried columns (userId, categoryId, etc.)
- Use GIN indexes for full-text search vectors
- Use unique constraints for business logic constraints (e.g., userId + youtubeId)

### Example Pattern

```typescript
export const videos = pgTable(
  'videos',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('vid')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // ... other fields
    ...lifecycle_dates,
  },
  (table) => [
    index('idx_videos_user_id').on(table.userId),
    unique('videos_user_youtube_unique').on(table.userId, table.youtubeId),
  ]
);
```

## Query Patterns

### Always Filter by User

```typescript
// ✅ Good: User-scoped query
const userVideos = await db
  .select()
  .from(videos)
  .where(eq(videos.userId, session.user.id));

// ❌ Bad: Missing userId filter
const allVideos = await db.select().from(videos);
```

### Explicit Column Selection

```typescript
// ✅ Good: Explicit columns
const result = await db
  .select({
    id: videos.id,
    title: videos.title,
    description: videos.description,
  })
  .from(videos);

// ❌ Bad: Using raw SQL with SELECT *
// Drizzle prevents this, but verify no raw SQL queries
```

### Pagination & Limits

```typescript
// ✅ Good: Always use limits
const result = await db
  .select()
  .from(videos)
  .where(eq(videos.userId, session.user.id))
  .limit(limit)
  .offset(offset);

// ❌ Bad: Unbounded query
const allVideos = await db
  .select()
  .from(videos)
  .where(eq(videos.userId, session.user.id));
```

### Window Functions for Counts

```typescript
// ✅ Good: Use window function to get count efficiently
const result = await db
  .select({
    id: videos.id,
    title: videos.title,
    totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
  })
  .from(videos)
  .where(eq(videos.userId, session.user.id))
  .limit(limit)
  .offset(offset);

// ❌ Bad: Separate count query (less efficient)
const count = await db.select({ count: sql`count(*)` }).from(videos);
const videos = await db.select().from(videos).limit(limit);
```

### Joins

```typescript
// ✅ Good: Explicit join with proper conditions
const result = await db
  .select({
    id: videos.id,
    title: videos.title,
    categoryName: categories.name,
  })
  .from(videos)
  .leftJoin(categories, eq(videos.categoryId, categories.id))
  .where(eq(videos.userId, session.user.id));

// ❌ Bad: Missing join condition or wrong join type
```

### Full-Text Search

```typescript
// ✅ Good: Use helper function for search vectors
import { createVideoSearchVector } from '~/db/schemas/videos';

const searchExpr = createVideoSearchVector(
  videos.title,
  videos.description,
  videos.channelName
);
const tsquery = sql`websearch_to_tsquery('simple', ${searchQuery})`;
const searchCondition = sql`${searchExpr} @@ ${tsquery}`;

// ❌ Bad: Inline search vector creation (not reusable)
```

## Type Safety

### Use Drizzle Type Inference

```typescript
// ✅ Good: Use inferred types
import type { DatabaseVideo } from '~/db/schemas/videos';

const video: DatabaseVideo = await db
  .select()
  .from(videos)
  .where(eq(videos.id, videoId))
  .limit(1)
  .then((rows) => rows[0]);

// Or use $inferSelect
type Video = typeof videos.$inferSelect;
```

### Type Assertions

```typescript
// ✅ Good: Type-safe SQL with sql<Type>
const totalCount = sql<number>`COUNT(*) OVER()`.as('total_count');

// ❌ Bad: Untyped SQL
const totalCount = sql`COUNT(*) OVER()`.as('total_count');
```

## Migration Safety

### Schema Changes

- When modifying schemas, verify migration will be generated correctly
- Check for breaking changes (column renames, type changes)
- Ensure indexes are added for new query patterns
- Verify foreign key constraints are correct

### Data Migrations

- Note: User mentioned not to generate SQL migration files
- Just update schema, user will handle migrations
- But still verify schema changes are safe

## Common Issues to Flag

### Security

- ❌ Queries without userId filtering
- ❌ Exposing userId in query results sent to client
- ❌ Missing foreign key constraints
- ❌ No cascade delete rules where needed

### Performance

- ❌ Missing indexes on filtered/sorted columns
- ❌ Unbounded queries without limits
- ❌ N+1 query problems
- ❌ Not using window functions for counts

### Type Safety

- ❌ Untyped SQL expressions
- ❌ Missing type assertions for SQL results
- ❌ Not using Drizzle's type inference

### Code Quality

- ❌ Not using helper functions (createId, lifecycle_dates, etc.)
- ❌ Inconsistent naming (snake_case in DB, camelCase in code)
- ❌ Missing indexes for common query patterns
- ❌ Not following existing schema patterns

## Best Practices

1. **Always** filter by userId for user-scoped data
2. **Always** use explicit column selection
3. **Always** add limits to queries
4. **Always** add indexes for filtered/sorted columns
5. **Always** use proper foreign key relationships
6. **Always** use type-safe SQL with `sql<Type>`
7. **Always** use helper functions (createId, createVideoSearchVector, etc.)
8. **Always** include lifecycle_dates in new tables
9. **Always** use window functions for counts when possible
10. **Always** verify cascade delete behavior is correct
