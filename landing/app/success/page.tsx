"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";

function SuccessContent() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const searchParams = useSearchParams();
  // Keep reading session_id for analytics purposes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <motion.div
        className="max-w-md w-full border border-[#2a2a2a] bg-[#141414] p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="flex justify-center mb-6">
          <BrandLogo />
        </div>
        {/* Checkmark */}
        <div className="text-center mb-6">
          <span className="font-mono text-[#00c853] text-4xl leading-none">✓</span>
          <h1 className="font-mono text-xl font-bold text-[#e0e0e0] mt-3">
            Subscription activated.
          </h1>
          <p className="font-mono text-sm text-[#888] mt-2">
            Check your email — your license key is on its way.
          </p>
          <p className="font-mono text-xs text-[#555] mt-2">
            It may take a minute or two to arrive. Check spam if you don&apos;t see it.
          </p>
        </div>

        {/* Activation instructions */}
        <div className="border border-[#2a2a2a] bg-[#0a0a0a] px-5 py-4 mb-6">
          <p className="font-mono text-xs text-[#888] mb-2 uppercase tracking-wider">
            Once you have your key
          </p>
          <p className="font-mono text-xs text-[#ff8c00]">
            Open CodeGrid → Settings → License → Paste key → Activate
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <Link
            href="/download"
            className="block w-full bg-[#ff8c00] hover:bg-[#e07d00] text-black font-mono text-sm font-semibold text-center py-3 transition-colors"
          >
            Download CodeGrid
          </Link>
          <a
            href="https://keyforge.dev/portal/request"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full border border-[#2a2a2a] hover:border-[#ff8c00] text-[#888] hover:text-[#ff8c00] font-mono text-sm text-center py-3 transition-colors"
          >
            Manage subscription
          </a>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="font-mono text-xs text-[#555] hover:text-[#ff8c00] transition-colors"
          >
            &larr; Back to home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="font-mono text-sm text-[#888]">Loading...</div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
