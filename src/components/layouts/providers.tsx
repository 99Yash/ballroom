import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '~/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Toaster richColors closeButton />
      <NuqsAdapter>{children}</NuqsAdapter>
      <Analytics />
    </ThemeProvider>
  );
}
