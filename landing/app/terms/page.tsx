import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "CodeGrid terms of service. Covers license grant, free trial, subscription pricing, license keys, restrictions, payments, refunds, and governing law for the CodeGrid desktop application by ZipLyne LLC.",
  alternates: {
    canonical: "https://codegrid.app/terms",
  },
};

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p className="font-mono text-xs text-[#888] mb-12">
          Last updated: March 26, 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-[#ccc]">
          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using CodeGrid (&quot;the Software&quot;), the website at
              codegrid.app (&quot;the Website&quot;), or any related services provided by
              ZipLyne LLC (&quot;Company,&quot; &quot;we,&quot; &quot;us&quot;), you agree to be bound by
              these Terms of Service. If you do not agree, do not use the Software.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              2. Description of Service
            </h2>
            <p>
              CodeGrid is a desktop application for macOS that provides a 2D canvas
              for managing multiple terminal sessions. The Software is distributed as
              a downloadable binary and operates entirely on your local machine.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              3. Free Trial
            </h2>
            <p>
              CodeGrid offers a free tier with limited sessions. To access the full
              feature set, you must subscribe to an active plan.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              4. License Grant
            </h2>
            <p>
              Upon subscribing ($7.99/month or $49/year), ZipLyne LLC grants you a
              non-exclusive, non-transferable license to use CodeGrid on machines you
              personally own or control while your active subscription remains current.
              Updates are included during your active subscription.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              5. License Keys
            </h2>
            <p>
              License keys are delivered via email and are cryptographically signed
              using Ed25519. Each license key is tied to your purchase and is intended
              for your personal use. You may not share, redistribute, sell, or
              sublicense your license key. ZipLyne LLC reserves the right to revoke
              license keys that are found to be shared or used in violation of these
              terms.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              6. Restrictions
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Reverse engineer, decompile, or disassemble the Software</li>
              <li>Modify, adapt, or create derivative works of the Software</li>
              <li>Remove or alter any proprietary notices, labels, or marks</li>
              <li>Share, redistribute, or sublicense your license key</li>
              <li>Use the Software for any unlawful purpose</li>
              <li>Circumvent or attempt to circumvent the licensing mechanism</li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              7. Payments and Refunds
            </h2>
            <p>
              All payments are processed securely through Stripe. CodeGrid is offered
              as a recurring subscription. You may cancel anytime; access continues
              until the end of your current billing period. No refunds are issued for
              partial periods after a license key has been activated. If you experience
              technical issues that prevent you from using the Software, contact us at
              support@codegrid.app and we will work to resolve the issue.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              8. Intellectual Property
            </h2>
            <p>
              The Software, including all code, design, graphics, documentation, and
              trademarks, is the exclusive property of ZipLyne LLC. These Terms do not
              grant you any rights to our trademarks, service marks, or trade names.
              All rights not expressly granted herein are reserved.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              9. Disclaimer of Warranties
            </h2>
            <p>
              THE SOFTWARE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
              WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT
              LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, AND NON-INFRINGEMENT. ZIPLYNE LLC DOES NOT WARRANT
              THAT THE SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
              COMPONENTS.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              10. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, ZIPLYNE LLC SHALL NOT BE LIABLE
              FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF
              OR IN CONNECTION WITH YOUR USE OF THE SOFTWARE. IN NO EVENT SHALL OUR
              TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID FOR THE SOFTWARE LICENSE.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              11. Termination
            </h2>
            <p>
              We may terminate or suspend your license immediately, without prior
              notice, if you breach these Terms. Upon termination, your right to use
              the Software ceases immediately. Sections regarding intellectual
              property, disclaimers, limitation of liability, and governing law
              survive termination.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              12. Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the
              laws of the State of Delaware, United States, without regard to its
              conflict of law provisions. Any disputes arising under these Terms shall
              be resolved in the state or federal courts located in Delaware.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              13. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be
              posted on this page with an updated &quot;Last updated&quot; date. Your continued
              use of the Software after changes constitutes acceptance of the revised
              Terms.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-base font-semibold text-[#e0e0e0] mb-3">
              14. Contact
            </h2>
            <p>
              If you have questions about these Terms, contact us at{" "}
              <a
                href="mailto:support@codegrid.app"
                className="text-[#ff8c00] hover:underline"
              >
                support@codegrid.app
              </a>
              .
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
