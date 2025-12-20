import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Trigger.dev build artifacts
    '.trigger/**',
  ]),
  {
    rules: {
      // Enforce import * as React from 'react' pattern
      // This rule blocks named imports from 'react' but allows namespace imports
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportDeclaration[source.value='react'] > ImportSpecifier",
          message:
            "Use 'import * as React from \"react\"' instead of named imports. Access hooks via React.useState, React.useEffect, etc.",
        },
      ],
      // Block imports from React subpackages (e.g., 'react/jsx-runtime')
      // Using no-restricted-imports for proper regex pattern matching
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^react/',
              message:
                "Use 'import * as React from \"react\"' instead of importing from 'react/*'.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
