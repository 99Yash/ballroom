import Link from 'next/link';

export default function AuthLayout(props: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4 py-12 min-h-0">
        {props.children}
      </main>
      <footer className="shrink-0 py-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to Ballroom&apos;s{' '}
        <Link
          href="/terms"
          className="underline transition-colors hover:text-foreground"
        >
          Terms
        </Link>{' '}
        and{' '}
        <Link
          href="/privacy"
          className="underline transition-colors hover:text-foreground"
        >
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
