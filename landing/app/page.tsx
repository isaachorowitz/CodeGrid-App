"use client";

import MuxPlayer from "@mux/mux-player-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { useEffect } from "react";
import { motion } from "framer-motion";

/** Mux asset playback ID — hero demo (autoplay requires muted in browsers). */
const HERO_MUX_PLAYBACK_ID = "oPu7h015GHVMppz025Q6peZxUOAu69LrkMMfdRkz00gm6Q";
const HERO_MUX_POSTER = `https://image.mux.com/${HERO_MUX_PLAYBACK_ID}/thumbnail.webp?width=1600&time=0`;
const HERO_PLAYBACK_RATE = 1.3;

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={stagger}
      className={`w-full max-w-6xl mx-auto px-4 sm:px-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent colors                                                       */
/* ------------------------------------------------------------------ */

const AGENT_COLORS: Record<string, string> = {
  CLAUDE: "#ff8c00",
  CODEX: "#10a37f",
  GEMINI: "#4285f4",
  CURSOR: "#a855f7",
  SHELL: "#4a9eff",
};

/* ------------------------------------------------------------------ */
/*  Mock terminal pane data                                            */
/* ------------------------------------------------------------------ */

const panes = [
  {
    title: "api-server",
    agent: "CLAUDE",
    status: "running" as const,
    lines: [
      "$ claude --model opus",
      "> Refactoring auth middleware...",
      "",
      "  Updated src/middleware/auth.ts",
      "  Added JWT refresh token logic",
      "  Running tests... \u2713 23 passed",
    ],
  },
  {
    title: "frontend",
    agent: "CODEX",
    status: "running" as const,
    lines: [
      "$ codex",
      "> Fix the dashboard layout bug",
      "",
      "  Reading src/components/Dashboard.tsx",
      "  Found issue: flex-wrap missing",
      "  Applying fix...",
    ],
  },
  {
    title: "database",
    agent: "GEMINI",
    status: "waiting" as const,
    lines: [
      "$ gemini",
      "> Add migration for user_roles",
      "",
      "  Created migration 004_user_roles.sql",
      "  \u23f3 Waiting for confirmation...",
      "",
    ],
  },
  {
    title: "refactor",
    agent: "CURSOR",
    status: "running" as const,
    lines: [
      "$ cursor",
      "> Modernize legacy payment module",
      "",
      "  Scanning src/payments/...",
      "  Replacing deprecated Stripe API calls",
      "  \u2713 8 files updated",
    ],
  },
  {
    title: "deploy",
    agent: "SHELL",
    status: "idle" as const,
    lines: [
      "$ git log --oneline -5",
      "a3f1c2d feat: add user roles",
      "b7e4a1f fix: auth middleware",
      "c9d2e3a refactor: dashboard",
      "d1f5b6c chore: update deps",
      "",
    ],
  },
  {
    title: "tests",
    agent: "SHELL",
    status: "running" as const,
    lines: [
      "$ npm run test:watch",
      "",
      "  PASS src/auth.test.ts",
      "  PASS src/api.test.ts",
      "  FAIL src/db.test.ts",
      "  Tests: 2 passed, 1 failed",
    ],
  },
];

const statusColor: Record<string, string> = {
  idle: "bg-status-idle",
  running: "bg-status-running",
  error: "bg-status-error",
  waiting: "bg-status-waiting",
};

/* ------------------------------------------------------------------ */
/*  Features                                                           */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: "\u2295",
    title: "5 AI Agents, One Workspace",
    desc: "Run Claude, Codex, Gemini, Cursor, and plain shells side by side. Mix and match \u2014 use the best model for each task without switching apps.",
    wide: true,
  },
  {
    icon: "\u229e",
    title: "2D Canvas",
    desc: "Drag and resize terminal panes freely on an infinite canvas. No tabs, no splits \u2014 just space. Zoom out to see everything at once.",
    wide: false,
  },
  {
    icon: "\u00bb",
    title: "Layout Presets",
    desc: "Switch between Auto, Focus, Columns, Rows, and Grid layouts to reorganize active panes instantly as your workflow changes.",
    wide: false,
  },
  {
    icon: "\u25c9",
    title: "Attention Detection",
    desc: "CodeGrid watches every session and highlights the ones that need you \u2014 Y/N prompts, approvals, confirmations \u2014 across any agent.",
    wide: false,
  },
  {
    icon: "\u2387",
    title: "Git Integration",
    desc: "Stage, commit, push, pull, branch, and stash without leaving the app. See diffs inline. A full Git UI lives in the sidebar.",
    wide: false,
  },
  {
    icon: "\u229f",
    title: "Browser Panes",
    desc: "Open a browser pane right on the canvas alongside your terminals. Preview your app, check docs, or review a PR \u2014 without leaving CodeGrid.",
    wide: false,
  },
  {
    icon: "\u2315",
    title: "File Tree & Project Search",
    desc: "Browse your project files and search across the entire codebase from the sidebar \u2014 no need to open another editor.",
    wide: false,
  },
  {
    icon: "\u229a",
    title: "GitHub Integration",
    desc: "Browse, search, and clone any of your GitHub repos (including org repos) directly from the new session dialog. No terminal needed.",
    wide: false,
  },
  {
    icon: "\u21bb",
    title: "Multiple Workspaces",
    desc: "Organize projects into separate workspaces, each with its own canvas layout. Switch instantly \u2014 positions, sizes, and directories are all saved.",
    wide: false,
  },
  {
    icon: "\u2318",
    title: "Command Palette",
    desc: "Cmd+K to access any action instantly \u2014 search panes, switch workspaces, launch agents, run commands.",
    wide: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Shortcuts                                                          */
/* ------------------------------------------------------------------ */

const shortcuts = [
  { keys: "\u2318 N", label: "New pane" },
  { keys: "\u2318 K", label: "Command palette" },
  { keys: "\u2318 \u21e7 \u2190\u2192", label: "Swap pane positions" },
  { keys: "\u2318 \u23ce", label: "Maximize pane" },
  { keys: "\u2318 1-9", label: "Jump to pane" },
  { keys: "\u2318 \u2190\u2192", label: "Navigate panes" },
];

/* ------------------------------------------------------------------ */
/*  Objections / Why CodeGrid                                          */
/* ------------------------------------------------------------------ */

const objections = [
  {
    q: "Does it work with my existing CLI tools?",
    a: "Yes \u2014 CodeGrid doesn\u2019t replace anything. It launches the same Claude, Codex, Gemini, Cursor, and shell workflows you already use inside real PTYs. No wrappers, no lock-in, no migration.",
  },
  {
    q: "How do I know when an agent needs my input?",
    a: "Attention detection reads every terminal and highlights panes that are waiting \u2014 Y/N prompts, approval requests, confirmations \u2014 across all agents at once. You\u2019ll never sit blocked on pane 6 because you were looking at pane 2.",
  },
  {
    q: "Can I run different agents in the same workspace?",
    a: "That\u2019s the whole point. Claude on the API layer, Codex on the frontend, Gemini reviewing the tests \u2014 all on one canvas, all running in parallel. Use the best model for each job without leaving the app.",
  },
  {
    q: "How many sessions can I run at once?",
    a: "CodeGrid is built for dense multi-session workflows. Run as many sessions as your machine supports \u2014 there are no artificial limits. Each pane runs in its own PTY with an isolated working directory.",
  },
  {
    q: "Why not tmux, iTerm2, or VS Code terminals?",
    a: "None of them provide a canvas-first workspace with session awareness. CodeGrid tracks pane activity, surfaces sessions that need attention, and combines layout control, Git tools, and workspace switching in one native app.",
  },
];

/* ------------------------------------------------------------------ */
/*  Social proof strip items                                           */
/* ------------------------------------------------------------------ */

const proofItems = [
  "Built with Tauri",
  "Git + GitHub built in",
  "Workspace-based",
  "Command palette",
  "macOS native",
  "5 AI agents",
];

/* ------------------------------------------------------------------ */
/*  FAQ JSON-LD for AEO / answer engines                               */
/* ------------------------------------------------------------------ */

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: objections.map((o) => ({
    "@type": "Question",
    name: o.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: o.a,
    },
  })),
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  useEffect(() => {
    // No-op: pricing page removed
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* -- Nav --------------------------------------------------- */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-bg-primary/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <BrandLogo priority />
          <div className="flex gap-6 text-xs font-mono text-text-secondary">
            <a href="#features" className="hover:text-accent transition-colors">
              Features
            </a>
            <a
              href="#shortcuts"
              className="hover:text-accent transition-colors hidden sm:inline"
            >
              Shortcuts
            </a>
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
      <div className="pt-28 pb-20 sm:pt-36 sm:pb-28 dot-grid">
        <Section className="text-center">
          <motion.h1
            variants={fadeUp}
            className="font-mono text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight"
          >
            Claude, Codex, Gemini, Cursor.{" "}
            <span className="text-accent">One canvas.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-5 max-w-2xl mx-auto text-text-secondary text-sm sm:text-base leading-relaxed"
          >
            Run Claude, Codex, Gemini, Cursor, and plain shells side by side
            on a 2D canvas you can drag and resize. Manage multiple projects,
            track active sessions, and keep AI coding workflows organized in one place.
          </motion.p>

          {/* Agent badge strip */}
          <motion.div
            variants={fadeUp}
            className="mt-6 flex items-center justify-center gap-3 flex-wrap"
          >
            {[
              { label: "Claude", color: AGENT_COLORS.CLAUDE },
              { label: "Codex", color: AGENT_COLORS.CODEX },
              { label: "Gemini", color: AGENT_COLORS.GEMINI },
              { label: "Cursor", color: AGENT_COLORS.CURSOR },
              { label: "Shell", color: AGENT_COLORS.SHELL },
            ].map((a) => (
              <span
                key={a.label}
                className="font-mono text-[11px] font-semibold px-2.5 py-0.5 border"
                style={{ color: a.color, borderColor: a.color + "55", background: a.color + "11" }}
              >
                {a.label}
              </span>
            ))}
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <a
              href="/download"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-black font-mono text-sm font-semibold px-6 py-3 transition-colors"
            >
              Download for Mac
            </a>
            <a
              href="https://github.com/isaachorowitz/CodeGrid-Claude-Code-Terminal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-border hover:border-text-secondary text-text-primary font-mono text-sm px-6 py-3 transition-colors"
            >
              View on GitHub
            </a>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="mt-4 text-xs font-mono text-text-secondary"
          >
            macOS &middot; Apple Silicon
          </motion.p>
        </Section>

        {/* -- Hero video — desktop app frame (not browser chrome) -------- */}
        <motion.div variants={fadeUp} className="mt-14 max-w-5xl mx-auto px-4 sm:px-6">
          <div
            className={[
              "overflow-hidden rounded-xl",
              "bg-[#121212]",
              "border border-[#2e2e32]",
              "shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_1px_0_0_rgba(255,255,255,0.06)_inset,0_32px_64px_-16px_rgba(0,0,0,0.65)]",
            ].join(" ")}
          >
            {/* Mux: chromeless, muted autoplay + loop; slightly faster */}
            <div className="relative w-full aspect-video bg-black">
              <MuxPlayer
                playbackId={HERO_MUX_PLAYBACK_ID}
                streamType="on-demand"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                playbackRate={HERO_PLAYBACK_RATE}
                preferPlayback="mse"
                poster={HERO_MUX_POSTER}
                accentColor="#ff8c00"
                proudlyDisplayMuxBadge={false}
                nohotkeys
                minResolution="1080p"
                maxResolution="2160p"
                metadata={{ video_title: "CodeGrid in action" }}
                className="absolute inset-0 w-full h-full [--controls:none] [--dialog:none] [--loading-indicator:none]"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* -- Social Proof Strip ------------------------------------ */}
      <div className="w-full border-y border-border bg-bg-secondary py-4 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
          {proofItems.map((item, i) => (
            <span key={item} className="flex items-center gap-4 sm:gap-6">
              <span className="font-mono text-xs sm:text-sm text-text-secondary whitespace-nowrap">
                {item}
              </span>
              {i < proofItems.length - 1 && (
                <span className="text-accent font-mono text-xs">&middot;</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* -- Features ---------------------------------------------- */}
      <div id="features" className="py-20 sm:py-28 bg-bg-secondary">
        <Section>
          <motion.h2
            variants={fadeUp}
            className="font-mono text-2xl sm:text-3xl font-bold text-center mb-4"
          >
            Built for multi-agent, parallel workflows
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="text-text-secondary text-sm text-center max-w-xl mx-auto mb-12"
          >
            Everything you need to run Claude, Codex, Gemini, and Cursor
            from a single workspace &mdash; without terminal sprawl.
          </motion.p>

          {/* Asymmetric feature grid */}
          <div className="grid sm:grid-cols-2 gap-px bg-border">
            {features.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                className={`bg-bg-secondary p-6 hover:bg-bg-tertiary transition-colors group ${
                  f.wide ? "sm:col-span-2" : ""
                }`}
              >
                <span className="font-mono text-2xl text-accent block mb-3">
                  {f.icon}
                </span>
                <h3 className="font-mono text-sm font-semibold mb-2 group-hover:text-accent transition-colors">
                  {f.title}
                </h3>
                <p className="text-text-secondary text-xs leading-relaxed">
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>
      </div>

      {/* -- Terminal Grid Preview ---------------------------------- */}
      <div className="py-20 sm:py-28">
        <Section>
          <motion.h2
            variants={fadeUp}
            className="font-mono text-2xl sm:text-3xl font-bold text-center mb-4"
          >
            Every agent. Every project. At a glance.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="text-text-secondary text-sm text-center max-w-xl mx-auto mb-12"
          >
            Claude, Codex, Gemini, Cursor, and shells &mdash; all visible on one canvas, all running in parallel.
          </motion.p>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px bg-border border border-border">
              {panes.map((pane, i) => (
                <motion.div
                  key={pane.title}
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: { delay: i * 0.1, duration: 0.5 },
                    },
                  }}
                  className={`bg-bg-primary flex flex-col ${pane.status === "waiting" ? "pulse-glow" : ""}`}
                >
                  {/* Pane header */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary border-b border-border">
                    <span
                      className={`w-2 h-2 shrink-0 ${statusColor[pane.status]}`}
                    />
                    <span className="font-mono text-[11px] text-text-secondary truncate flex-1">
                      {pane.title}
                    </span>
                    <span
                      className="font-mono text-[9px] font-semibold px-1.5 py-0.5 shrink-0"
                      style={{
                        color: AGENT_COLORS[pane.agent],
                        background: AGENT_COLORS[pane.agent] + "18",
                      }}
                    >
                      {pane.agent}
                    </span>
                  </div>
                  {/* Pane content */}
                  <div className="p-3 flex-1 min-h-[120px] sm:min-h-[150px] overflow-hidden">
                    {pane.lines.map((line, j) => (
                      <div
                        key={j}
                        className={`font-mono text-[10px] sm:text-xs leading-relaxed whitespace-pre-wrap break-words ${
                          line.startsWith("$")
                            ? "text-status-running"
                            : line.startsWith(">")
                              ? "text-accent"
                              : line.includes("FAIL") || line.includes("failed")
                                ? "text-status-error"
                                : line.includes("\u2713") || line.includes("PASS")
                                  ? "text-status-running"
                                  : line.includes("\u23f3")
                                    ? "text-status-waiting"
                                    : "text-text-secondary"
                        }`}
                      >
                        {line || "\u00A0"}
                        {pane.status === "waiting" && j === pane.lines.length - 1 && (
                          <span className="cursor-blink text-status-waiting">_</span>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </Section>
      </div>

      {/* -- How It Works ------------------------------------------ */}
      <div className="py-20 sm:py-28">
        <Section>
          <motion.h2
            variants={fadeUp}
            className="font-mono text-2xl sm:text-3xl font-bold text-center mb-14"
          >
            How it works
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                step: "01",
                title: "Launch CodeGrid",
                desc: "Open the app and start from a clean workspace designed for fast multi-session terminal workflows.",
              },
              {
                step: "02",
                title: "Pick your agents",
                desc: "Add panes for Claude, Codex, Gemini, Cursor, or a plain shell. Each pane connects to its own project directory.",
              },
              {
                step: "03",
                title: "Arrange and ship",
                desc: "Organize your canvas layout, use Git tools from the sidebar, and move changes forward without leaving the app.",
              },
            ].map((s) => (
              <motion.div key={s.step} variants={fadeUp}>
                <span className="font-mono text-4xl font-bold text-accent/30">
                  {s.step}
                </span>
                <h3 className="font-mono text-sm font-semibold mt-3 mb-2">
                  {s.title}
                </h3>
                <p className="text-text-secondary text-xs leading-relaxed">
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>
      </div>

      {/* -- Why CodeGrid (Objection handling) --------------------- */}
      <div className="py-20 sm:py-28 bg-bg-secondary">
        <Section>
          <motion.h2
            variants={fadeUp}
            className="font-mono text-2xl sm:text-3xl font-bold text-center mb-14"
          >
            Why CodeGrid?
          </motion.h2>

          <div className="space-y-px bg-border border border-border">
            {objections.map((o) => (
              <motion.div
                key={o.q}
                variants={fadeUp}
                className="bg-bg-secondary p-6 sm:p-8 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-12"
              >
                <p className="font-mono text-sm text-text-primary font-semibold sm:w-1/3 shrink-0">
                  {o.q}
                </p>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {o.a}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>
      </div>

      {/* -- Shortcuts --------------------------------------------- */}
      <div id="shortcuts" className="py-20 sm:py-28 bg-bg-secondary">
        <Section>
          <motion.h2
            variants={fadeUp}
            className="font-mono text-2xl sm:text-3xl font-bold text-center mb-12"
          >
            Keyboard-first
          </motion.h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border border border-border max-w-2xl mx-auto">
            {shortcuts.map((s) => (
              <motion.div
                key={s.keys}
                variants={fadeUp}
                className="bg-bg-secondary p-4 flex flex-col items-center gap-2"
              >
                <kbd className="font-mono text-sm text-accent font-semibold">
                  {s.keys}
                </kbd>
                <span className="font-mono text-[11px] text-text-secondary">
                  {s.label}
                </span>
              </motion.div>
            ))}
          </div>
        </Section>
      </div>

      </main>

      {/* -- Footer ------------------------------------------------ */}
      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-text-secondary">
          <BrandLogo size="sm" />
          <div className="flex gap-6">
            <a
              href="https://github.com/isaachorowitz/CodeGrid-Claude-Code-Terminal"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              GitHub
            </a>
            <a href="/terms" className="hover:text-accent transition-colors">
              Terms
            </a>
            <a href="/privacy" className="hover:text-accent transition-colors">
              Privacy
            </a>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span>Built with Tauri + React</span>
            <span>&copy; 2026 ZipLyne LLC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
