import Link from 'next/link';
import { siteConfig } from '~/lib/site';

export default function TermsPage() {
  const effectiveDate = 'January 17, 2026';
  const listClassName =
    'list-disc pl-5 pt-3.5 space-y-1 text-foreground/70 font-medium text-[13.5px]';
  const listItemClassName = 'leading-relaxed tracking-tight';
  const bodyClassName =
    'space-y-6 text-sm text-foreground/80 [&_p]:leading-relaxed [&_p]:tracking-tight [&_h2]:text-foreground [&_h2]:text-base [&_h2]:font-medium [&_h2]:tracking-tight [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-foreground/20 [&_a]:transition-all [&_a:hover]:decoration-foreground-muted';

  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
        {siteConfig.name} Terms of Service
      </h1>
      <div className={bodyClassName}>
        <p className="text-foreground/60 text-xs italic tracking-tight">
          Effective date: {effectiveDate}
        </p>
        <p>
          By using {siteConfig.name}, you agree to these terms. If you do not
          agree, do not use the service.
        </p>

        <h2>About the service</h2>
        <p>
          {siteConfig.name} is a personal, non-commercial hobby project that
          helps you organize your YouTube liked videos using AI. The service may
          change or be discontinued at any time.
        </p>

        <h2>Accounts and access</h2>
        <ul className={listClassName}>
          <li className={listItemClassName}>
            You must sign in with Google to use the service.
          </li>
          <li className={listItemClassName}>
            You are responsible for maintaining the security of your Google
            account.
          </li>
          <li className={listItemClassName}>
            Do not use the service for unlawful or abusive purposes.
          </li>
        </ul>

        <h2>YouTube and Google terms</h2>
        <p>
          You agree to comply with Google and YouTube terms of service. YouTube
          content remains owned by its respective creators.
        </p>

        <h2>AI-generated organization</h2>
        <p>
          Categorization is automated and may be inaccurate. You are responsible
          for reviewing and managing your categories.
        </p>

        <h2>Availability and warranty</h2>
        <p>
          The service is provided "as is" without warranties of any kind. We do
          not guarantee uninterrupted or error-free operation.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we are not liable for any
          indirect, incidental, or consequential damages arising from your use
          of the service.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using the service at any time. We may suspend or
          terminate access if needed to protect the service or comply with law.
        </p>

        <h2>Privacy</h2>
        <p>
          Please review our{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>{' '}
          to understand how we handle your data.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We may update these terms occasionally. If we make changes, we will
          update the effective date above.
        </p>

        <h2>Contact</h2>
        <p>
          Questions? Email{' '}
          <a href="mailto:yashgouravkar@gmail.com">
            yashgouravkar@gmail.com
          </a>
          .
        </p>

        <p className="pt-2">
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 text-foreground/70 transition hover:text-foreground"
          >
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
