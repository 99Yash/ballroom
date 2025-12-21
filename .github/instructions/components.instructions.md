# React Component Code Review Instructions

## Component Patterns

### Server vs Client Components

- **Default to Server Components** - only use `'use client'` when necessary
- Use client components for: interactivity, hooks, browser APIs, event handlers
- Keep data fetching in Server Components when possible

### Component Structure

```typescript
// ✅ Good: Server Component with data fetching
export default async function Page() {
  const session = await requireSession();
  const videos = await getVideos(session.user.id);
  return <VideoList videos={videos} />;
}

// ✅ Good: Client Component for interactivity
('use client');
export function VideoList({ videos }: { videos: SerializedVideo[] }) {
  const [filter, setFilter] = useState('');
  // ... interactive logic
}
```

## Type Safety

### Props Types

```typescript
// ✅ Good: Explicit props interface
interface VideoCardProps {
  video: SerializedVideo;
  onSelect?: (video: SerializedVideo) => void;
}

export function VideoCard({ video, onSelect }: VideoCardProps) {
  // ...
}

// ❌ Bad: Inline types or any
export function VideoCard({ video, onSelect }: any) {
  // ...
}
```

### Import Types

```typescript
// ✅ Good: Import serialized types for client components
import type { SerializedVideo } from '~/types/video';

// ❌ Bad: Using DatabaseVideo in client components
import type { DatabaseVideo } from '~/db/schemas/videos';
```

## Styling

### ClassName Composition

```typescript
// ✅ Good: Use cn() utility
import { cn } from '~/lib/utils';

<div className={cn('base-class', isActive && 'active-class', className)} />

// ❌ Bad: String concatenation
<div className={'base-class ' + (isActive ? 'active-class' : '')} />
```

### Tailwind CSS

- Use Tailwind utility classes
- Keep custom CSS in `globals.css` when needed
- Use shadcn/ui components from `~/components/ui/`

## State Management

### Local State

```typescript
// ✅ Good: useState for local component state
const [isOpen, setIsOpen] = useState(false);

// ❌ Bad: Global state for local UI state
// (unless actually needed across components)
```

### Server State

- Prefer Server Components for initial data
- Use React Server Actions for mutations
- Consider SWR/React Query only if needed for complex caching

## Event Handlers

### Type Safety

```typescript
// ✅ Good: Properly typed handlers
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.preventDefault();
  // ...
};

// ❌ Bad: Untyped handlers
const handleClick = (e: any) => {
  // ...
};
```

### Async Handlers

```typescript
// ✅ Good: Proper async handling
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    await submitForm();
    toast.success('Success!');
  } catch (error) {
    toast.error('Failed');
  }
};

// ❌ Bad: Unhandled promise
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  submitForm(); // Missing await and error handling
};
```

## Forms

### React Hook Form

```typescript
// ✅ Good: Use React Hook Form with Zod
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod/v4';

const schema = z.object({
  name: z.string().min(2),
});

const form = useForm({
  resolver: zodResolver(schema),
});

// ❌ Bad: Manual form handling
const [name, setName] = useState('');
```

## Common Issues to Flag

### Performance

- ❌ Missing `use client` directive when using hooks
- ❌ Unnecessary re-renders (missing memoization)
- ❌ Large components that should be split
- ❌ Not using Server Components when possible

### Type Safety

- ❌ Using `any` types
- ❌ Missing prop types
- ❌ Using database types in client components
- ❌ Untyped event handlers

### Code Quality

- ❌ Not using `cn()` for className composition
- ❌ Inconsistent component structure
- ❌ Missing error boundaries
- ❌ Not handling loading/error states

### Security

- ❌ Exposing sensitive data in client components
- ❌ Not validating user inputs
- ❌ Missing authentication checks in Server Components

## Best Practices

1. **Default to Server Components** - only use client when needed
2. **Use explicit prop types** - never use `any`
3. **Use `cn()` utility** for className composition
4. **Import serialized types** for client components
5. **Handle loading/error states** appropriately
6. **Use React Hook Form** with Zod for forms
7. **Type event handlers** properly
8. **Handle async operations** with try-catch
9. **Use toast notifications** (sonner) for user feedback
10. **Keep components focused** - split large components
