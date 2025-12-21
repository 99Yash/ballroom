Use `readonly` properties for object types by default. This will prevent accidental mutation at runtime.

Omit `readonly` only when the property is genuinely mutable.

```ts
// BAD
type User = {
  id: string;
};

const user: User = {
  id: "1",
};

user.id = "2";
```

```ts
// GOOD
type User = {
  readonly id: string;
};

const user: User = {
  id: "1",
};

user.id = "2"; // Error
```

**Note**: When working with Drizzle ORM inferred types (`$inferSelect`, `$inferInsert`), you may need to use `Pick` or `Omit` to add readonly constraints, as Drizzle's base types are mutable by design for database operations.
