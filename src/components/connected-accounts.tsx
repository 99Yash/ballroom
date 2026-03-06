'use client';

import { Twitter } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Google } from '~/components/ui/icons/google';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Spinner } from '~/components/ui/spinner';
import { useConnectedAccounts } from '~/hooks/use-connected-accounts';
import { authClient } from '~/lib/auth/client';
import { getErrorMessage } from '~/lib/utils';

interface ConnectedAccountsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
}

export function ConnectedAccounts({
  open,
  onOpenChange,
  userEmail,
}: ConnectedAccountsProps) {
  const { accounts, xConfigured, isLoading, hasX, refetch } =
    useConnectedAccounts();
  const [isLinking, setIsLinking] = React.useState(false);
  const [isUnlinking, setIsUnlinking] = React.useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] =
    React.useState(false);

  const xAccount = React.useMemo(
    () => accounts.find((a) => a.providerId === 'twitter'),
    [accounts]
  );

  const handleConnectX = async () => {
    setIsLinking(true);
    try {
      await authClient.linkSocial({
        provider: 'twitter',
        callbackURL: '/dashboard',
      });
    } catch (error) {
      toast.error('Failed to connect X', {
        description: getErrorMessage(error),
      });
      setIsLinking(false);
    }
  };

  const handleDisconnectX = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsUnlinking(true);
    try {
      await authClient.unlinkAccount({
        providerId: 'twitter',
      });
      toast.success('X account disconnected');
      await refetch();
      setShowDisconnectConfirm(false);
    } catch (error) {
      toast.error('Failed to disconnect X', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Connected Accounts</SheetTitle>
            <SheetDescription>
              Manage your linked accounts for syncing content.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4">
            {/* Google account — primary, non-removable */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div className="flex items-center gap-3">
                <Google className="h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">Google</p>
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                </div>
              </div>
              <Badge variant="secondary">Primary</Badge>
            </div>

            {/* X account — connect/disconnect */}
            {xConfigured && (
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <div className="flex items-center gap-3">
                  <Twitter className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium">X</p>
                    <p className="text-xs text-muted-foreground">
                      {hasX
                        ? `@${xAccount?.accountId ?? 'connected'}`
                        : 'Not connected'}
                    </p>
                  </div>
                </div>
                {hasX ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDisconnectConfirm(true)}
                    disabled={isUnlinking}
                  >
                    {isUnlinking ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      'Disconnect'
                    )}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleConnectX}
                    disabled={isLinking}
                  >
                    {isLinking ? <Spinner className="h-4 w-4" /> : 'Connect'}
                  </Button>
                )}
              </div>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Spinner className="h-5 w-5" />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={showDisconnectConfirm}
        onOpenChange={setShowDisconnectConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect X account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your X account link. You won&apos;t be able to
              sync X bookmarks or likes until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnlinking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnectX}
              disabled={isUnlinking}
            >
              {isUnlinking ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
