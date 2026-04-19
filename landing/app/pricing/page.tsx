"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { useState } from "react";
import { motion } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

/* ------------------------------------------------------------------ */
/*  Feature comparison data                                            */
/* ------------------------------------------------------------------ */

type FeatureRow = {
  label: string;
  free: string | boolean;
  pro: string | boolean;
};

const COMPARISON: FeatureRow[] = [
  { label: "Concurrent sessions",          free: "Up to 3",  pro: "Up to 50" },
  { label: "Claude agent",                 free: true,        pro: true },
  { label: "Codex agent",                  free: true,        pro: true },
  { label: "Gemini agent",                 free: true,        pro: true },
  { label: "Cursor agent",                 free: true,        pro: true },
  { label: "Shell agent",                  free: true,        pro: true },
  { label: "2D canvas & all layouts",      free: true,        pro: true },
  { label: "Git manager",                  free: true,        pro: true },
  { label: "MCP server management",        free: true,        pro: true },
  { label: "GitHub repo browser",          free: true,        pro: true },
  { label: "Attention detection",          free: true,        pro: true },
  { label: "Quick Actions AI prompts",     free: false,       pro: true },
  { label: "Priority app updates",         free: false,       pro: true },
];

const FREE_FEATURES = [
  "Up to 3 sessions",
  "All 5 AI agents (Claude, Codex, Gemini, Cursor, shell)",
  "2D canvas, workspaces & all layout presets",
  "Git manager with staging, commits, branches",
  "MCP server management",
  "GitHub repo browser",
  "Attention detection",
];

const PRO_FEATURES = [
  "Up to 50 sessions",
  "Everything in Free",
  "Quick Actions AI prompts (Review, Fix Bug, Test, Refactor…)",
  "Priority app updates",
];

const FAQ = [
  {
    q: "Is there a free plan?",
    a: "Yes — every install starts with a 14-day Pro trial (no credit card, no account). After the trial you stay on the free plan forever: 3 sessions, all 5 agents, Git manager, MCP, and GitHub browser included. Upgrade to Pro for 50 sessions and Quick Actions.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel any time via the customer portal — no hoops to jump through. Your Pro access continues until the end of the billing period you already paid for.",
  },
  {
    q: "What happens when I subscribe?",
    a: "After checkout you'll receive a license key by email from Keyforge (our licensing provider). Open CodeGrid, go to Settings → License, paste the key, and hit Activate. Pro features unlock immediately — no restart needed.",
  },
  {
    q: "Which macOS versions are supported?",
    a: "CodeGrid requires macOS 13 Ventura or later on Apple Silicon (M1 and newer).",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Check() {
  return (
    <span className="font-mono text-status-running text-xs">✓</span>
  );
}

function Cross() {
  return (
    <span className="font-mono text-text-secondary/40 text-xs">—</span>
  );
}

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) return <Check />;
  if (value === false) return <Cross />;
  return <span className="font-mono text-xs text-text-primary">{value}</span>;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"annual" | "monthly">("annual");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const isAnnual = billingPeriod === "annual";

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: billingPeriod }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setCheckoutError(data.error || "Failed to create checkout session.");
      setCheckoutLoading(false);
    } catch {
      setCheckoutError("Network error. Please try again.");
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">

      {/* -- Nav --------------------------------------------------- */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-bg-primary/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <BrandLogo priority />
          <div className="flex gap-6 text-xs font-mono text-text-secondary">
            <Link href="/#features" className="hover:text-accent transition-colors">
              Features
            </Link>
            <Link
              href="/download"
              className="hover:text-accent transition-colors hidden sm:inline"
            >
              Download
            </Link>
            <a
              href="https://github.com/isaachorowitz/CodeGrid-Claude-Code-Terminal"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      <main>
      {/* -- Hero -------------------------------------------------- */}
      <div className="pt-28 pb-16 sm:pt-36 sm:pb-20 dot-grid border-b border-border">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="max-w-3xl mx-auto px-4 sm:px-6 text-center"
        >
          <motion.p
            variants={fadeUp}
            className="font-mono text-xs text-accent tracking-widest uppercase mb-4"
          >
            Pricing
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="font-mono text-3xl sm:text-5xl font-bold tracking-tight leading-tight"
          >
            Start free.{" "}
            <span className="text-accent">Upgrade when you&rsquo;re ready.</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mt-5 text-sm sm:text-base text-text-secondary max-w-xl mx-auto leading-relaxed"
          >
            Free forever — no credit card required. Get 3 sessions and all 5 AI agents at no cost.
            Go Pro for unlimited sessions and the full feature set.
          </motion.p>

          {/* Billing toggle */}
          <motion.div
            variants={fadeUp}
            className="mt-8 inline-flex items-center gap-1 border border-border bg-bg-secondary p-1"
          >
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`font-mono text-xs px-4 py-2 transition-colors cursor-pointer ${
                !isAnnual
                  ? "bg-accent text-black font-semibold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`font-mono text-xs px-4 py-2 transition-colors cursor-pointer flex items-center gap-2 ${
                isAnnual
                  ? "bg-accent text-black font-semibold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Annual
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 ${
                  isAnnual
                    ? "bg-black/20 text-black"
                    : "bg-accent/15 text-accent"
                }`}
              >
                Save 49%
              </span>
            </button>
          </motion.div>
        </motion.div>
      </div>

      {/* -- Pricing cards ----------------------------------------- */}
      <div className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="grid sm:grid-cols-2 gap-px bg-border"
          >

            {/* FREE card */}
            <motion.div
              variants={fadeUp}
              className="bg-bg-secondary p-8 sm:p-10 flex flex-col"
            >
              <div className="flex-1">
                <p className="font-mono text-xs text-text-secondary uppercase tracking-widest mb-6">
                  Free
                </p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="font-mono text-5xl font-bold text-text-primary leading-none">
                    $0
                  </span>
                  <span className="font-mono text-sm text-text-secondary mb-2">
                    forever
                  </span>
                </div>
                <p className="font-mono text-xs text-text-secondary mt-3 mb-8">
                  No credit card · No time limit
                  <br />
                  macOS · Apple Silicon
                </p>

                <ul className="space-y-3">
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-text-primary">
                      <span className="font-mono text-status-running text-xs mt-0.5 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10">
                <Link
                  href="/download"
                  className="block w-full text-center border border-border hover:border-text-secondary text-text-primary font-mono text-sm py-3 transition-colors"
                >
                  Download Free
                </Link>
              </div>
            </motion.div>

            {/* PRO card */}
            <motion.div
              variants={fadeUp}
              className="bg-bg-primary p-8 sm:p-10 flex flex-col border-2 border-accent relative"
            >
              {/* PRO badge */}
              <div className="absolute -top-px left-8">
                <span className="font-mono text-[10px] font-semibold bg-accent text-black px-3 py-1 uppercase tracking-widest">
                  Pro
                </span>
              </div>

              <div className="flex-1 mt-4">
                <p className="font-mono text-xs text-accent uppercase tracking-widest mb-6">
                  Pro
                </p>

                {isAnnual ? (
                  <>
                    <div className="flex items-end gap-2 mb-1">
                      <span className="font-mono text-5xl font-bold text-accent leading-none">
                        $49
                      </span>
                      <span className="font-mono text-sm text-text-secondary mb-2">
                        / year
                      </span>
                    </div>
                    <p className="font-mono text-xs text-text-secondary mt-1">
                      $4.08/mo billed annually · 5 months free
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-end gap-2 mb-1">
                      <span className="font-mono text-5xl font-bold text-accent leading-none">
                        $7.99
                      </span>
                      <span className="font-mono text-sm text-text-secondary mb-2">
                        / month
                      </span>
                    </div>
                    <p className="font-mono text-xs text-text-secondary mt-1">
                      Billed monthly · cancel anytime
                    </p>
                  </>
                )}

                <ul className="space-y-3 mt-8">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-text-primary">
                      <span className="font-mono text-accent text-xs mt-0.5 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10 space-y-3">
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="block w-full text-center bg-accent hover:bg-accent-hover text-black font-mono text-sm font-semibold py-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkoutLoading
                    ? "Processing..."
                    : isAnnual
                    ? "Get Pro — $49/yr"
                    : "Get Pro — $7.99/mo"}
                </button>
                {checkoutError && (
                  <p className="text-center text-xs text-status-error font-mono mt-2">
                    {checkoutError}
                  </p>
                )}
                <p className="text-center text-xs text-text-secondary font-mono pt-1">
                  Secure checkout via Stripe
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* -- Feature comparison table ------------------------------ */}
      <div className="pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xl sm:text-2xl font-bold mb-8 text-center"
          >
            Compare plans
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="border border-border overflow-hidden"
          >
            {/* Table header */}
            <div className="grid grid-cols-3 bg-bg-secondary border-b border-border">
              <div className="p-4 font-mono text-xs text-text-secondary uppercase tracking-widest">
                Feature
              </div>
              <div className="p-4 font-mono text-xs text-text-secondary uppercase tracking-widest text-center border-l border-border">
                Free
              </div>
              <div className="p-4 font-mono text-xs text-accent uppercase tracking-widest text-center border-l border-border">
                Pro
              </div>
            </div>

            {/* Table rows */}
            {COMPARISON.map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-3 border-b border-border last:border-b-0 ${
                  i % 2 === 0 ? "bg-bg-primary" : "bg-bg-secondary"
                }`}
              >
                <div className="p-4 font-mono text-xs text-text-secondary">
                  {row.label}
                </div>
                <div className="p-4 text-center border-l border-border">
                  <CellValue value={row.free} />
                </div>
                <div className="p-4 text-center border-l border-border">
                  <CellValue value={row.pro} />
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* -- FAQ --------------------------------------------------- */}
      <div className="border-t border-border py-16 sm:py-24 bg-bg-secondary">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xl sm:text-2xl font-bold mb-10 text-center"
          >
            Common questions
          </motion.h2>

          <div className="divide-y divide-border">
            {FAQ.map((item, i) => (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left py-5 flex items-center justify-between gap-4 font-mono text-sm text-text-primary hover:text-accent transition-colors cursor-pointer"
                >
                  <span>{item.q}</span>
                  <span className="text-text-secondary text-lg leading-none shrink-0">
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i && (
                  <p className="pb-5 text-sm text-text-secondary leading-relaxed">
                    {item.a}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      </main>

      {/* -- Footer CTA -------------------------------------------- */}
      <footer className="border-t border-border py-12 text-center">
        <p className="font-mono text-xs text-text-secondary mb-4">
          Still have questions?
        </p>
        <a
          href="https://github.com/isaachorowitz/CodeGrid-Claude-Code-Terminal"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-accent hover:underline"
        >
          Open an issue on GitHub →
        </a>
      </footer>
    </div>
  );
}
