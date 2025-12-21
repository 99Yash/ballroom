Use optional properties extremely sparingly. Only use them when the property is truly optional, and consider whether bugs may be caused by a failure to pass the property.

In the example below we always want to pass user ID to `AuthOptions`. This is because if we forget to pass it somewhere in the code base, it will cause our function to be not authenticated.

```ts
// BAD
type AuthOptions = {
  userId?: string;
};

const func = (options: AuthOptions) => {
  const userId = options.userId;
};
```

```ts
// GOOD
type AuthOptions = {
  userId: string | undefined;
};

const func = (options: AuthOptions) => {
  const userId = options.userId;
};
```

**Note**: This rule applies to object/interface properties. Function parameters can use optional syntax (`param?: Type`) when the parameter is genuinely optional and has a default behavior. For example:

```ts
// ACCEPTABLE - function parameter with default behavior
export function createId(prefix?: string, options = {}) {
  // prefix is truly optional, function works without it
}
```
