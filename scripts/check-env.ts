#!/usr/bin/env tsx
/**
 * Environment validation script
 * Run this to check if all required environment variables are set
 * Usage: pnpm check-env or npm run check-env
 */

import { env } from '../src/lib/env';

console.log('✅ Checking environment variables...\n');

try {
  // This will throw if validation fails
  const requiredVars = [
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'BETTER_AUTH_SECRET',
  ] as const;

  console.log('Required environment variables:');
  for (const key of requiredVars) {
    const value = env[key];
    const display =
      key.includes('SECRET') || key.includes('KEY')
        ? '***hidden***'
        : value.slice(0, 20) + '...';

    console.log(`  ✓ ${key}: ${display}`);
  }

  console.log('\n✅ All required environment variables are set!\n');

  // Additional checks
  console.log('Additional checks:');

  // Check database URL format
  if (env.DATABASE_URL.startsWith('postgres')) {
    console.log('  ✓ DATABASE_URL appears to be a valid PostgreSQL URL');
  } else {
    console.warn('  ⚠ DATABASE_URL does not appear to be a PostgreSQL URL');
  }

  // Check Node environment
  console.log(`  ✓ NODE_ENV: ${env.NODE_ENV}`);

  console.log('\n🎉 Environment configuration is valid!\n');
  process.exit(0);
} catch (error) {
  if (error instanceof Error) {
    console.error('❌ Environment validation failed:\n');
    console.error(error.message);
  }
  console.error(
    '\n💡 Tip: Create a .env.local file with the required environment variables.\n'
  );
  process.exit(1);
}
