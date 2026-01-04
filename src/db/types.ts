import { db } from './index';

/**
 * Type alias for the Drizzle transaction context.
 * Extracts the transaction parameter type from db.transaction callback.
 * This provides better type safety and readability than inline type extraction.
 */
export type TransactionContext = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

