If `noUncheckedIndexedAccess` is enabled in `tsconfig.json`, indexing into objects and arrays will behave differently from how you expect.

**Current status**: This option is not currently enabled in this project's `tsconfig.json`, but be aware of this behavior if it's enabled in the future.

```ts
const obj: Record<string, string> = {};

// With noUncheckedIndexedAccess, value will
// be `string | undefined`
// Without it, value will be `string`
const value = obj.key;
```

```ts
const arr: string[] = [];

// With noUncheckedIndexedAccess, value will
// be `string | undefined`
// Without it, value will be `string`
const value = arr[0];
```
