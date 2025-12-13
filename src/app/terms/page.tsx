import Link from 'next/link';
import { siteConfig } from '~/lib/site';

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold">
        {siteConfig.name} Terms of Service
      </h1>
      <div className="prose prose-gray">
        <p className="text-muted-foreground">
          Terms of Service coming soon. Please check back later.
        </p>
        <p className="mt-8">
          <Link href="/signin" className="text-primary hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
