import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <Toaster richColors closeButton theme="system" />
      <NuqsAdapter>{children}</NuqsAdapter>
      <Analytics />
    </ThemeProvider>
  );
}
