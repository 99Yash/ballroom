import { DatabaseCategory } from '~/db/schemas';
import { serialize, Serialize } from '~/lib/utils';

/**
 * Client-safe category type (excludes userId)
 */
export type Category = Pick<
  DatabaseCategory,
  'id' | 'name' | 'isDefault' | 'parentCategoryId'
>;

/**
 * Serialized for client (Date → string)
 */
export type SerializedCategory = Serialize<Category>;

export function serializeCategory<T extends Category>(
  category: T
): Serialize<T> {
  return serialize(category);
}
