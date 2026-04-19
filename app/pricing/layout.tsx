import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "CodeGrid pricing plans: Free forever with 3 sessions and all 5 AI agents, or upgrade to Pro for $49/year ($4.08/mo) with up to 50 sessions, Quick Actions, and priority updates. No credit card required to start.",
  alternates: {
    canonical: "https://codegrid.app/pricing",
  },
  openGraph: {
    title: "CodeGrid Pricing — Free forever, Pro from $4.08/mo",
    description:
      "Start free with 3 sessions and all 5 AI agents. Upgrade to Pro for $49/year with up to 50 sessions, Quick Actions AI prompts, and priority updates.",
    url: "https://codegrid.app/pricing",
  },
  twitter: {
    title: "CodeGrid Pricing — Free forever, Pro from $4.08/mo",
    description:
      "Start free with 3 sessions and all 5 AI agents. Upgrade to Pro for $49/year with up to 50 sessions, Quick Actions AI prompts, and priority updates.",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is there a free plan for CodeGrid?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — every install starts with a 14-day Pro trial (no credit card, no account). After the trial you stay on the free plan forever: 3 sessions, all 5 agents, Git manager, MCP, and GitHub browser included. Upgrade to Pro for 50 sessions and Quick Actions.",
      },
    },
    {
      "@type": "Question",
      name: "Can I cancel my CodeGrid subscription anytime?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Cancel any time via the customer portal — no hoops to jump through. Your Pro access continues until the end of the billing period you already paid for.",
      },
    },
    {
      "@type": "Question",
      name: "What happens when I subscribe to CodeGrid Pro?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "After checkout you'll receive a license key by email from Keyforge (our licensing provider). Open CodeGrid, go to Settings → License, paste the key, and hit Activate. Pro features unlock immediately — no restart needed.",
      },
    },
    {
      "@type": "Question",
      name: "Which macOS versions does CodeGrid support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CodeGrid requires macOS 13 Ventura or later on Apple Silicon (M1 and newer).",
      },
    },
  ],
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
