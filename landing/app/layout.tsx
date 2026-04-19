import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://codegrid.app"),
  title: {
    default: "CodeGrid — Claude, Codex, Gemini, Cursor. One canvas.",
    template: "%s | CodeGrid",
  },
  description:
    "Run Claude, Codex, Gemini, Cursor, and shells in parallel on a 2D canvas. Drag, resize, and manage AI coding sessions from a single workspace. Built with Tauri for macOS.",
  keywords: [
    "Claude Code",
    "Codex",
    "Gemini",
    "Cursor",
    "AI agents",
    "terminal manager",
    "developer tools",
    "Tauri",
    "workspace",
    "parallel AI coding",
    "AI coding workspace",
    "multi-agent terminal",
    "macOS developer tools",
    "AI terminal manager",
    "coding canvas",
  ],
  applicationName: "CodeGrid",
  authors: [{ name: "ZipLyne LLC", url: "https://codegrid.app" }],
  creator: "ZipLyne LLC",
  publisher: "ZipLyne LLC",
  category: "Developer Tools",
  alternates: {
    canonical: "https://codegrid.app",
  },
  openGraph: {
    title: "CodeGrid — Claude, Codex, Gemini, Cursor. One canvas.",
    description:
      "Run Claude, Codex, Gemini, Cursor, and shells in parallel on a 2D canvas. Drag, resize, and manage AI coding sessions from a single workspace. Built with Tauri for macOS.",
    type: "website",
    siteName: "CodeGrid",
    url: "https://codegrid.app",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "CodeGrid — Terminal workspace manager for AI coding agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeGrid — Claude, Codex, Gemini, Cursor. One canvas.",
    description:
      "Run Claude, Codex, Gemini, Cursor, and shells in parallel on a 2D canvas. Drag, resize, and manage AI coding sessions from a single workspace. Built with Tauri for macOS.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  other: {
    "theme-color": "#0a0a0a",
  },
};

/* ------------------------------------------------------------------ */
/*  JSON-LD structured data (global)                                   */
/* ------------------------------------------------------------------ */

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ZipLyne LLC",
  url: "https://codegrid.app",
  logo: "https://codegrid.app/icon-512.png",
  sameAs: [
    "https://github.com/isaachorowitz/CodeGrid-Claude-Code-Terminal",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@codegrid.app",
    contactType: "customer support",
  },
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CodeGrid",
  description:
    "Run Claude, Codex, Gemini, Cursor, and shells in parallel on a 2D canvas. Drag, resize, and manage AI coding sessions from a single workspace. Built with Tauri for macOS.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS",
  processorRequirements: "Apple Silicon (M1 or later)",
  url: "https://codegrid.app",
  downloadUrl: "https://codegrid.app/download",
  screenshot: "https://codegrid.app/og.png",
  softwareVersion: "1.0",
  offers: [
    {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      name: "Free",
      description: "Up to 3 sessions, all 5 AI agents, Git manager, MCP server management, GitHub repo browser, and attention detection.",
    },
    {
      "@type": "Offer",
      price: "49.00",
      priceCurrency: "USD",
      name: "Pro (Annual)",
      description: "Up to 50 sessions, Quick Actions AI prompts, priority app updates, and everything in Free.",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "49.00",
        priceCurrency: "USD",
        billingDuration: "P1Y",
      },
    },
    {
      "@type": "Offer",
      price: "7.99",
      priceCurrency: "USD",
      name: "Pro (Monthly)",
      description: "Up to 50 sessions, Quick Actions AI prompts, priority app updates, and everything in Free.",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "7.99",
        priceCurrency: "USD",
        billingDuration: "P1M",
      },
    },
  ],
  featureList: [
    "Run Claude, Codex, Gemini, Cursor, and shell agents side by side",
    "2D canvas with drag-and-resize terminal panes",
    "Layout presets: Auto, Focus, Columns, Rows, Grid",
    "Attention detection for agent prompts and approvals",
    "Built-in Git integration with staging, commits, branches",
    "Browser panes on the canvas",
    "File tree and project search",
    "GitHub repo browser and clone",
    "Multiple workspaces with saved layouts",
    "Command palette (Cmd+K)",
  ],
};

const webSiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "CodeGrid",
  url: "https://codegrid.app",
  description:
    "CodeGrid is a macOS desktop application for running multiple AI coding agents in parallel on a 2D canvas workspace.",
  publisher: {
    "@type": "Organization",
    name: "ZipLyne LLC",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} antialiased`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="preconnect" href="https://stream.mux.com" />
        <link rel="preconnect" href="https://image.mux.com" />
        <link rel="dns-prefetch" href="//stream.mux.com" />
        <link rel="dns-prefetch" href="//image.mux.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
      </head>
      <body className="min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
