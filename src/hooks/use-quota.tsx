'use client';

import type { QuotaInfo, QuotaState } from '~/contexts/user-context';
import { useUserContext } from '~/contexts/user-context';
import { APP_CONFIG } from '~/lib/constants';

export type { QuotaInfo, QuotaState };

export function useQuota() {
  const { quota, quotaLoading, quotaError, refetchQuota } = useUserContext();
  return {
    quota,
    isLoading: quotaLoading,
    error: quotaError,
    refetch: refetchQuota,
  };
}

export function isQuotaLow(quota: QuotaInfo): boolean {
  return quota.percentageUsed >= APP_CONFIG.quota.warningThreshold;
}

export function isQuotaExceeded(quota: QuotaInfo): boolean {
  return quota.remaining <= 0;
}
