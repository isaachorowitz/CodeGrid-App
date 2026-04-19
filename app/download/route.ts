import { NextRequest, NextResponse } from "next/server";

const REPO = "isaachorowitz/CodeGrid-Claude-Code-Terminal";
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function GET(req: NextRequest) {
  // Log download event server-side
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  const referer = req.headers.get("referer") ?? "direct";
  console.log(
    `[download] ip=${ip} ua=${ua.slice(0, 80)} ref=${referer} time=${new Date().toISOString()}`
  );

  try {
    // Fetch latest release from GitHub API (no auth needed for public repos)
    const res = await fetch(GITHUB_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 }, // cache for 5 minutes
    });

    if (res.ok) {
      const release = await res.json();
      const dmg = release.assets?.find((a: any) => a.name.endsWith(".dmg"));
      if (dmg?.browser_download_url) {
        return NextResponse.redirect(dmg.browser_download_url, 302);
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: send to the releases page
  return NextResponse.redirect(
    `https://github.com/${REPO}/releases/latest`,
    302
  );
}
