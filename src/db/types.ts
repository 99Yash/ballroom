import { db } from './index';

export type TransactionContext = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
