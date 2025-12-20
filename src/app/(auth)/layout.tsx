import Link from 'next/link';

export default function AuthLayout(props: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="flex flex-1 items-center justify-center px-4">
        {props.children}
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground">
        By continuing, you agree to
        <br />
        Ballroom&apos;s{' '}
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
