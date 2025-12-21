Use import type whenever you are importing a type.

Prefer top-level `import type` over inline `import { type ... }`.

```ts
// BAD
import { type User } from "./user";
```

```ts
// GOOD
import type { User } from "./user";
```

The reason for this is that in certain environments, the first version's import will not be erased. So you'll be left with:

```ts
// Before transpilation
import { type User } from "./user";

// After transpilation
import "./user";
```

**Exception**: When importing both types and values from the same module, inline `type` is acceptable:

```ts
// ACCEPTABLE - mixing types and values from same module
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
```

However, if you're only importing types, use top-level `import type`:

```ts
// GOOD - only types
import type { SerializedVideo } from '~/types/video';
```
