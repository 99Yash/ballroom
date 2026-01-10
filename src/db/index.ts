import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import { env } from '~/lib/env';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Ensure `timestamp` (without timezone) is treated as UTC when parsing into JS Dates.
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) => {
  return new Date(value.replace(' ', 'T') + 'Z');
});

// Ensure casts between timestamptz and timestamp happen in UTC.
pool.on('connect', (client) => {
  void client.query("SET TIME ZONE 'UTC'");
});

export const db = drizzle({ client: pool });
