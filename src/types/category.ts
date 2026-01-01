import type { DatabaseCategory } from '~/db/schemas';

/**
 * Client-safe category type (excludes userId and date fields)
 */
export type Category = Pick<
  DatabaseCategory,
  'id' | 'name' | 'isDefault' | 'parentCategoryId'
>;
