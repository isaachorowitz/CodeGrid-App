import { NextResponse } from "next/server";

// License lookup is now handled by Keyforge.
// Redirect customers to the self-serve portal.
export async function GET() {
  return NextResponse.redirect("https://keyforge.dev/portal/request");
}
