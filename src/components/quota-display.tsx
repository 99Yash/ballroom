'use client';

import { format } from 'date-fns';
import { BarChart3, RefreshCw, Wand2 } from 'lucide-react';
import * as React from 'react';
import { Badge } from '~/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Progress } from '~/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { isQuotaExceeded, isQuotaLow, useQuota } from '~/hooks/use-quota';
import { cn, formatTimeToNow } from '~/lib/utils';

function QuotaItem({
  label,
  quota,
  icon: Icon,
}: {
  label: string;
  quota: {
    used: number;
    limit: number;
    remaining: number;
    percentageUsed: number;
    resetAt: string | null;
  };
  icon: React.ComponentType<{ className?: string }>;
}) {
  const low = isQuotaLow(quota);
  const exceeded = isQuotaExceeded(quota);

  const resetText = quota.resetAt
    ? formatTimeToNow(quota.resetAt)
    : null;

  const displayValue = `${quota.used.toLocaleString()}/${quota.limit.toLocaleString()}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2 transition-colors hover:bg-muted/50">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <Badge
                variant="secondary"
                className={cn(
                  'h-4 px-1.5 text-xs font-normal',
                  low && !exceeded && 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
                  exceeded && 'bg-destructive/10 text-destructive'
                )}
              >
                {displayValue}
              </Badge>
            </div>
            <Progress
              value={quota.percentageUsed}
              className={cn(
                'mt-1.5 h-1.5',
                exceeded && '[&>div]:bg-destructive',
                low && !exceeded && '[&>div]:bg-amber-500'
              )}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          <div className="font-medium">{label} Quota</div>
          <div className="text-xs text-muted-foreground">
            Used: {quota.used.toLocaleString()} of {quota.limit.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            Remaining: {quota.remaining.toLocaleString()}
          </div>
          {resetText && (
            <div className="text-xs text-muted-foreground">
              Resets {resetText}
            </div>
          )}
          {exceeded && (
            <div className="pt-1 text-xs text-destructive">
              Quota exceeded. Resets monthly.
            </div>
          )}
          {low && !exceeded && (
            <div className="pt-1 text-xs text-amber-600 dark:text-amber-500">
              Quota is running low.
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function QuotaDisplay() {
  const { quota, isLoading, error } = useQuota();

  if (error) {
    return null;
  }

  if (isLoading || !quota) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 transition-colors hover:bg-muted/50"
            aria-label="Quota"
          >
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-1">
            <div className="text-sm font-medium">Quota</div>
            <div className="text-xs text-muted-foreground">Loading...</div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  const syncLow = isQuotaLow(quota.sync);
  const syncExceeded = isQuotaExceeded(quota.sync);
  const categorizeLow = isQuotaLow(quota.categorize);
  const categorizeExceeded = isQuotaExceeded(quota.categorize);

  const hasWarning = syncLow || categorizeLow || syncExceeded || categorizeExceeded;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 transition-colors hover:bg-muted/50',
            hasWarning && 'border-amber-500/50 bg-amber-500/5'
          )}
          aria-label="Quota usage"
        >
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <div className="text-xs font-medium">
              <span className="hidden sm:inline">Sync: </span>
              <span className={cn(syncExceeded && 'text-destructive')}>
                {quota.sync.remaining.toLocaleString()}
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="text-xs font-medium">
              <span className="hidden sm:inline">Cat: </span>
              <span className={cn(categorizeExceeded && 'text-destructive')}>
                {quota.categorize.remaining.toLocaleString()}
              </span>
            </div>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div>
            <div className="mb-3 text-sm font-semibold">Quota Usage</div>
            <div className="space-y-3">
              <QuotaItem label="Sync" quota={quota.sync} icon={RefreshCw} />
              <QuotaItem
                label="Categorize"
                quota={quota.categorize}
                icon={Wand2}
              />
            </div>
          </div>
          {quota.sync.resetAt && (
            <div className="border-t border-border pt-3">
              <div className="text-xs text-muted-foreground">
                <div className="font-medium mb-1">Resets</div>
                <div>{formatTimeToNow(quota.sync.resetAt)}</div>
                <div className="mt-1 opacity-75">
                  {format(new Date(quota.sync.resetAt), 'PPp')}
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

