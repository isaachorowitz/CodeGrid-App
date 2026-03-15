import { memo, useState, useCallback } from "react";
import { useAppStore } from "../stores/appStore";
import { cloneRepo } from "../lib/ipc";

interface HubRepo {
  name: string;
  url: string;
  description: string;
  category: string;
  stars?: string;
}

const FEATURED_REPOS: HubRepo[] = [
  // AI / Claude
  {
    name: "claude-code",
    url: "https://github.com/anthropics/claude-code",
    description: "Official Claude Code CLI by Anthropic",
    category: "AI Tools",
    stars: "30k+",
  },
  {
    name: "anthropic-cookbook",
    url: "https://github.com/anthropics/anthropic-cookbook",
    description: "Recipes and examples for building with Claude",
    category: "AI Tools",
    stars: "8k+",
  },
  {
    name: "anthropic-sdk-python",
    url: "https://github.com/anthropics/anthropic-sdk-python",
    description: "Official Python SDK for the Anthropic API",
    category: "AI Tools",
    stars: "3k+",
  },
  {
    name: "anthropic-sdk-typescript",
    url: "https://github.com/anthropics/anthropic-sdk-typescript",
    description: "Official TypeScript SDK for the Anthropic API",
    category: "AI Tools",
    stars: "2k+",
  },
  // Popular frameworks
  {
    name: "next.js",
    url: "https://github.com/vercel/next.js",
    description: "The React framework for the web",
    category: "Frameworks",
    stars: "130k+",
  },
  {
    name: "create-t3-app",
    url: "https://github.com/t3-oss/create-t3-app",
    description: "Full-stack typesafe Next.js starter",
    category: "Starters",
    stars: "26k+",
  },
  {
    name: "shadcn-ui",
    url: "https://github.com/shadcn-ui/ui",
    description: "Beautiful UI components built with Radix + Tailwind",
    category: "UI",
    stars: "80k+",
  },
  {
    name: "FastAPI",
    url: "https://github.com/fastapi/fastapi",
    description: "Modern Python web framework, fast and easy",
    category: "Frameworks",
    stars: "80k+",
  },
  // AI projects
  {
    name: "langchain",
    url: "https://github.com/langchain-ai/langchain",
    description: "Build apps with LLMs through composability",
    category: "AI Tools",
    stars: "100k+",
  },
  {
    name: "open-webui",
    url: "https://github.com/open-webui/open-webui",
    description: "User-friendly AI interface",
    category: "AI Tools",
    stars: "70k+",
  },
  // Starter templates
  {
    name: "vite",
    url: "https://github.com/vitejs/vite",
    description: "Next generation frontend tooling",
    category: "Frameworks",
    stars: "70k+",
  },
  {
    name: "tauri",
    url: "https://github.com/tauri-apps/tauri",
    description: "Build native desktop apps with web tech",
    category: "Frameworks",
    stars: "90k+",
  },
];

const CATEGORY_ORDER = ["AI Tools", "Frameworks", "Starters", "UI"];

export const HubBrowser = memo(function HubBrowser() {
  const { hubBrowserOpen, setHubBrowserOpen } = useAppStore();
  const [filter, setFilter] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [cloning, setCloning] = useState<string | null>(null);
  const [cloned, setCloned] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const filtered = filter
    ? FEATURED_REPOS.filter(
        (r) =>
          r.name.toLowerCase().includes(filter.toLowerCase()) ||
          r.description.toLowerCase().includes(filter.toLowerCase()) ||
          r.category.toLowerCase().includes(filter.toLowerCase()),
      )
    : FEATURED_REPOS;

  const grouped: Record<string, HubRepo[]> = {};
  for (const repo of filtered) {
    if (!grouped[repo.category]) grouped[repo.category] = [];
    grouped[repo.category].push(repo);
  }

  const handleClone = useCallback(
    async (url: string, name: string) => {
      setCloning(name);
      setError(null);
      try {
        const path = await cloneRepo(url);
        setCloned((prev) => ({ ...prev, [name]: path }));
        setCloning(null);
      } catch (e) {
        setError(String(e));
        setCloning(null);
      }
    },
    [],
  );

  const handleCloneCustom = useCallback(async () => {
    if (!customUrl.trim()) return;
    const name = customUrl.split("/").pop()?.replace(".git", "") ?? "repo";
    await handleClone(customUrl.trim(), name);
  }, [customUrl, handleClone]);

  const handleOpenInGridCode = useCallback(
    (path: string) => {
      setHubBrowserOpen(false);
      // Trigger new session with this path
      window.dispatchEvent(
        new CustomEvent("gridcode:quick-session", {
          detail: { path, type: "claude" },
        }),
      );
    },
    [setHubBrowserOpen],
  );

  if (!hubBrowserOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: "40px",
      }}
      onClick={() => setHubBrowserOpen(false)}
    >
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.6)" }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "640px",
          maxHeight: "600px",
          background: "#141414",
          border: "1px solid #ff8c00",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #2a2a2a",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ color: "#ff8c00", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px" }}>
              HUB — CLONE & OPEN
            </div>
            <div style={{ color: "#555555", fontSize: "10px", marginTop: "2px" }}>
              Clone any repo and start coding with Claude instantly
            </div>
          </div>
          <button
            onClick={() => setHubBrowserOpen(false)}
            style={{
              background: "none", border: "none", color: "#555555",
              fontSize: "14px", cursor: "pointer", fontFamily: "'SF Mono', monospace",
            }}
          >
            x
          </button>
        </div>

        {/* Custom URL input */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a2a" }}>
          <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>
            PASTE ANY GITHUB URL
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              autoFocus
              style={{
                flex: 1,
                background: "#0a0a0a",
                border: "1px solid #2a2a2a",
                color: "#e0e0e0",
                fontSize: "12px",
                fontFamily: "'SF Mono', monospace",
                padding: "8px",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCloneCustom();
              }}
            />
            <button
              onClick={handleCloneCustom}
              disabled={!customUrl.trim()}
              style={{
                background: customUrl.trim() ? "#ff8c00" : "#2a2a2a",
                border: "none",
                color: customUrl.trim() ? "#0a0a0a" : "#555555",
                fontSize: "11px",
                fontFamily: "'SF Mono', monospace",
                cursor: customUrl.trim() ? "pointer" : "default",
                padding: "8px 16px",
                fontWeight: "bold",
              }}
            >
              CLONE
            </button>
          </div>
          {error && (
            <div style={{ color: "#ff3d00", fontSize: "10px", marginTop: "4px" }}>
              {error}
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #2a2a2a" }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search featured repos..."
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              color: "#e0e0e0",
              fontSize: "12px",
              fontFamily: "'SF Mono', monospace",
              padding: "4px 0",
              outline: "none",
            }}
          />
        </div>

        {/* Repos list */}
        <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
          {CATEGORY_ORDER.filter((c) => grouped[c]).map((category) => (
            <div key={category}>
              <div
                style={{
                  padding: "6px 16px 2px",
                  fontSize: "9px",
                  color: "#ff8c00",
                  letterSpacing: "1px",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                }}
              >
                {category}
              </div>
              {grouped[category].map((repo) => {
                const isCloning = cloning === repo.name;
                const clonedPath = cloned[repo.name];
                return (
                  <div
                    key={repo.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 16px",
                      gap: "12px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#1e1e1e")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#e0e0e0", fontSize: "12px", fontWeight: "bold" }}>
                          {repo.name}
                        </span>
                        {repo.stars && (
                          <span style={{ color: "#ffab00", fontSize: "9px" }}>
                            {repo.stars}
                          </span>
                        )}
                      </div>
                      <div style={{ color: "#888888", fontSize: "10px", marginTop: "2px" }}>
                        {repo.description}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      {clonedPath ? (
                        <button
                          onClick={() => handleOpenInGridCode(clonedPath)}
                          style={{
                            background: "#00c853",
                            border: "none",
                            color: "#0a0a0a",
                            fontSize: "10px",
                            fontFamily: "'SF Mono', monospace",
                            cursor: "pointer",
                            padding: "4px 10px",
                            fontWeight: "bold",
                          }}
                        >
                          OPEN
                        </button>
                      ) : (
                        <button
                          onClick={() => handleClone(repo.url, repo.name)}
                          disabled={isCloning}
                          style={{
                            background: isCloning ? "#2a2a2a" : "#1e1e1e",
                            border: "1px solid #2a2a2a",
                            color: isCloning ? "#ffab00" : "#888888",
                            fontSize: "10px",
                            fontFamily: "'SF Mono', monospace",
                            cursor: isCloning ? "default" : "pointer",
                            padding: "4px 10px",
                          }}
                          onMouseEnter={(e) => {
                            if (!isCloning) {
                              e.currentTarget.style.borderColor = "#ff8c00";
                              e.currentTarget.style.color = "#ff8c00";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isCloning) {
                              e.currentTarget.style.borderColor = "#2a2a2a";
                              e.currentTarget.style.color = "#888888";
                            }
                          }}
                        >
                          {isCloning ? "CLONING..." : "CLONE"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
