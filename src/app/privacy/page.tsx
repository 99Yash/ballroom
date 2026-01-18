import Link from 'next/link';
import { siteConfig } from '~/lib/site';

export default function PrivacyPage() {
  const effectiveDate = 'January 17, 2026';

  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
        {siteConfig.name} Privacy Policy
      </h1>
      <div className="space-y-6 text-sm text-foreground/80 [&_p]:leading-relaxed [&_p]:tracking-tight [&_h2]:text-foreground [&_h2]:text-base [&_h2]:font-medium [&_h2]:tracking-tight [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-foreground/20 [&_a]:transition-all [&_a:hover]:decoration-foreground-muted">
        <p className="text-foreground/60 text-xs italic tracking-tight">
          Effective date: {effectiveDate}
        </p>
        <p>
          {siteConfig.name} is a personal hobby project that helps you organize
          your YouTube liked videos using AI. This policy explains what data we
          collect, how we use it, and your choices.
        </p>

        <h2>Information we collect</h2>
        <ul className="list-disc pl-5 pt-3.5 space-y-1 text-foreground/70 font-medium text-[13.5px]">
          <li className="leading-relaxed tracking-tight">
            Google account details such as your name, email address, and profile
            image.
          </li>
          <li className="leading-relaxed tracking-tight">
            YouTube liked videos metadata such as video title, description,
            channel name, and publish date.
          </li>
          <li className="leading-relaxed tracking-tight">
            OAuth tokens from Google that allow us to access the YouTube API on
            your behalf.
          </li>
          <li className="leading-relaxed tracking-tight">
            App usage data like sync/categorization counts and timestamps.
          </li>
        </ul>

        <h2>How we use your information</h2>
        <ul className="list-disc pl-5 pt-3.5 space-y-1 text-foreground/70 font-medium text-[13.5px]">
          <li className="leading-relaxed tracking-tight">
            Provide the core service (sync, search, and categorization).
          </li>
          <li className="leading-relaxed tracking-tight">
            Improve organization accuracy and app experience.
          </li>
          <li className="leading-relaxed tracking-tight">
            Maintain security, prevent abuse, and troubleshoot issues.
          </li>
        </ul>

        <h2>AI processing</h2>
        <p>
          We send limited video metadata (title, description, and channel name)
          to Google&apos;s Generative AI API to categorize your videos. This
          data is processed under Google&apos;s terms and privacy policy.
        </p>

        <h2>Sharing and third parties</h2>
        <p>
          We do not sell your data. We share data only with service providers
          needed to run the app, including Google (OAuth and YouTube API) and
          Vercel (hosting).
        </p>

        <h2>Cookies</h2>
        <p>
          We use cookies to keep you signed in and to secure the session. These
          are essential for the app to function.
        </p>

        <h2>Data retention</h2>
        <p>
          We keep your data while your account is active. You can request data
          deletion at any time by emailing{' '}
          <a href="mailto:yashgouravkar@gmail.com">
            yashgouravkar@gmail.com
          </a>
          . We will delete your account data within a reasonable timeframe.
        </p>

        <h2>Your choices</h2>
        <ul className="list-disc pl-5 pt-3.5 space-y-1 text-foreground/70 font-medium text-[13.5px]">
          <li className="leading-relaxed tracking-tight">
            Disconnect access by revoking the app in your Google account.
          </li>
          <li className="leading-relaxed tracking-tight">
            Request access or deletion by contacting us.
          </li>
        </ul>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy occasionally. If we make changes, we will
          update the effective date above.
        </p>

        <h2>Contact</h2>
        <p>
          If you have questions, email{' '}
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
