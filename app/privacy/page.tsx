import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "CodeGrid privacy policy. We collect minimal data: email for license delivery, a machine identifier for activation, and payment via Stripe. No telemetry, no analytics, no tracking. Your work stays on your machine.",
  alternates: {
    canonical: "https://codegrid.app/privacy",
  },
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <div className="flex flex-wrap items-center gap-4 mb-12">
          <BrandLogo size="sm" />
          <a
            href="/"
            className="inline-block font-mono text-xs text-[#888] hover:text-[#ff8c00] transition-colors"
          >
            &larr; Back to home
          </a>
        </div>

        <h1 className="font-mono text-2xl sm:text-3xl font-bold mb-2">
          Privacy Policy
        </h1>
        <p className="font-mono text-xs text-[#888] mb-12">
          Last updated: March 22, 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-[#ccc]">
          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              1. Introduction
            </h2>
            <p>
              ZipLyne LLC (&quot;Company,&quot; &quot;we,&quot; &quot;us&quot;) operates the CodeGrid
              desktop application and the website at codegrid.app. This Privacy Policy
              explains what data we collect, how we use it, and your rights regarding
              that data.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              2. Data We Collect
            </h2>
            <p className="mb-3">We collect minimal data:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Email address</strong> &mdash; collected at the time of
                purchase through Stripe. Used solely to deliver your license key and
                for purchase-related communication.
              </li>
              <li>
                <strong>Machine identifier</strong> &mdash; a locally generated
                identifier used to bind your license key to your device. This
                identifier is sent to our server only during license activation.
              </li>
              <li>
                <strong>Payment information</strong> &mdash; processed entirely by
                Stripe. We do not store credit card numbers, bank account details, or
                other payment credentials on our servers.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              3. Data We Do Not Collect
            </h2>
            <p>
              CodeGrid is a local-first application. The desktop app does not include
              any telemetry, analytics, tracking, or crash reporting. We do not
              collect usage data, keystrokes, terminal output, file contents, or any
              information about how you use the application. Your work stays on your
              machine.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              4. How We Use Your Data
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>To deliver your license key via email</li>
              <li>To validate your license during activation</li>
              <li>To process your payment through Stripe</li>
              <li>To respond to support requests</li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              5. Third-Party Services
            </h2>
            <p className="mb-3">We use the following third-party services:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Stripe</strong> &mdash; payment processing. Stripe collects
                and processes payment information under its own privacy policy:{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ff8c00] hover:underline"
                >
                  https://stripe.com/privacy
                </a>
              </li>
              <li>
                <strong>Resend</strong> &mdash; transactional email delivery. Used
                only to send your license key email.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              6. Data Retention
            </h2>
            <p>
              We retain your email address and license information for as long as your
              license is active. Payment records are retained as required by applicable
              tax and accounting laws. You may request deletion of your data by
              contacting us at support@codegrid.app.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              7. Data Security
            </h2>
            <p>
              License keys are cryptographically signed using Ed25519. We use HTTPS
              for all communications between the application and our servers. While we
              implement reasonable security measures, no method of transmission or
              storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              8. Your Rights Under GDPR
            </h2>
            <p>
              If you are located in the European Economic Area (EEA), you have the
              right to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Request data portability</li>
              <li>Withdraw consent at any time</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a
                href="mailto:support@codegrid.app"
                className="text-[#ff8c00] hover:underline"
              >
                support@codegrid.app
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              9. Your Rights Under CCPA
            </h2>
            <p>
              If you are a California resident, you have the right to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Know what personal information we collect and how it is used</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of the sale of your personal information</li>
              <li>Not be discriminated against for exercising your rights</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information. To submit a request, contact
              us at{" "}
              <a
                href="mailto:support@codegrid.app"
                className="text-[#ff8c00] hover:underline"
              >
                support@codegrid.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              10. Children&apos;s Privacy
            </h2>
            <p>
              CodeGrid is not directed at children under the age of 13. We do not
              knowingly collect personal information from children. If we become aware
              that a child under 13 has provided us with personal data, we will take
              steps to delete it.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              11. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be
              posted on this page with an updated &quot;Last updated&quot; date. Your continued
              use of CodeGrid after changes constitutes acceptance of the revised
              policy.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              12. Contact
            </h2>
            <p>
              For privacy-related questions or requests, contact us at{" "}
              <a
                href="mailto:support@codegrid.app"
                className="text-[#ff8c00] hover:underline"
              >
                support@codegrid.app
              </a>
              .
            </p>
            <p className="mt-3">
              ZipLyne LLC
              <br />
              codegrid.app
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-[#2a2a2a] font-mono text-xs text-[#555]">
          <span>&copy; 2026 ZipLyne LLC</span>
        </div>
      </div>
    </div>
  );
}
