'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { useIsMobile } from '~/hooks/use-mobile';
import { cn } from '~/lib/utils';

interface ModalProps {
  children: React.ReactNode;
  className?: string;
  showModal?: boolean;
  setShowModal?: (open: boolean) => void;
  onClose?: () => void;
  desktopOnly?: boolean;
  preventDefaultClose?: boolean;
  showCloseButton?: boolean;
}

export function Modal({
  children,
  className,
  showModal,
  setShowModal,
  onClose,
  desktopOnly,
  preventDefaultClose,
  showCloseButton = true,
}: ModalProps) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const closeModal = React.useCallback(
    ({ dragged }: { dragged?: boolean } = {}) => {
      if (preventDefaultClose && !dragged) {
        return;
      }
      onClose?.();
      if (setShowModal) {
        setShowModal(false);
      } else {
        router.back();
      }
    },
    [preventDefaultClose, onClose, setShowModal, router]
  );

  const isControlled = setShowModal !== undefined;
  const isOpen = isControlled ? showModal : true;

  if (isMobile && !desktopOnly) {
    return (
      <DrawerPrimitive.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeModal({ dragged: true });
          }
        }}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <DrawerPrimitive.Content
            className={cn(
              'bg-background fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[80vh] flex-col rounded-t-lg border-t p-4',
              className
            )}
          >
            <div className="bg-muted mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full" />
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    );
  }

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeModal();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
            className
          )}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close className="ring-offset-background focus:ring-ring absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none">
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
