import { NextRequest, NextResponse } from "next/server";

const REPO = "isaachorowitz/CodeGrid-App";
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  const referer = req.headers.get("referer") ?? "direct";
  console.log(`[download] ip=${ip} ua=${ua.slice(0, 80)} ref=${referer} time=${new Date().toISOString()}`);

  try {
    const res = await fetch(GITHUB_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const release = await res.json();
      const dmg = release.assets?.find((a: { name: string; browser_download_url: string }) => a.name.endsWith(".dmg"));
      if (dmg?.browser_download_url) {
        return NextResponse.redirect(dmg.browser_download_url, 302);
      }
    }
  } catch {
    // Fall through to fallback
  }

  return NextResponse.redirect(`https://github.com/${REPO}/releases/latest`, 302);
}
