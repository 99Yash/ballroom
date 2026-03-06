import { runSync } from '~/lib/sync/engine';

// ---------------------------------------------------------------------------
// Legacy types – preserved for backward compatibility with existing callers
// (workflows, API routes). New code should use SyncResult from sources/types.
// ---------------------------------------------------------------------------

export interface ProgressiveSyncOptions {
  initialLimit?: number;
  maxDepth?: number;
  checkQuota?: boolean;
}

export interface SyncResult {
  synced: number;
  new: number;
  existing: number;
  unliked: number;
  reachedEnd: boolean;
}

// ---------------------------------------------------------------------------
// Compat helpers – map engine result to legacy shape
// ---------------------------------------------------------------------------

function toLegacyResult(
  engineResult: Awaited<ReturnType<typeof runSync>>
): SyncResult {
  return {
    synced: engineResult.synced,
    new: engineResult.new,
    existing: engineResult.existing,
    unliked: engineResult.inactive,
    reachedEnd: engineResult.reachedEnd,
  };
}

// ---------------------------------------------------------------------------
// Public API – unchanged signatures for existing callers
// ---------------------------------------------------------------------------

export async function progressiveSync(
  userId: string,
  options: ProgressiveSyncOptions = {}
): Promise<SyncResult> {
  // Determine mode from legacy options
  const mode =
    options.initialLimit === options.maxDepth && options.maxDepth !== undefined
      ? 'full'
      : options.initialLimit !== undefined && options.initialLimit > 100
        ? 'extended'
        : 'quick';

  const result = await runSync(userId, 'youtube', 'likes', {
    mode,
    checkQuota: options.checkQuota,
  });
  return toLegacyResult(result);
}

export async function quickSync(
  userId: string,
  options: Omit<ProgressiveSyncOptions, 'initialLimit'> = {}
): Promise<SyncResult> {
  const result = await runSync(userId, 'youtube', 'likes', {
    mode: 'quick',
    checkQuota: options.checkQuota,
  });
  return toLegacyResult(result);
}

export async function extendedSync(
  userId: string,
  options: Omit<ProgressiveSyncOptions, 'initialLimit'> = {}
): Promise<SyncResult> {
  const result = await runSync(userId, 'youtube', 'likes', {
    mode: 'extended',
    checkQuota: options.checkQuota,
  });
  return toLegacyResult(result);
}

export async function fullSync(
  userId: string,
  options: Omit<ProgressiveSyncOptions, 'initialLimit' | 'maxDepth'> = {}
): Promise<SyncResult> {
  const result = await runSync(userId, 'youtube', 'likes', {
    mode: 'full',
    checkQuota: options.checkQuota,
  });
  return toLegacyResult(result);
}
