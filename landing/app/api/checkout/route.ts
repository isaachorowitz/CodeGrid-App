import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  // Validate request origin in production — allow apex, www, and Vercel preview URLs
  const origin = req.headers.get("origin");
  if (process.env.NODE_ENV === "production" && origin) {
    const baseUrl = process.env.NEXT_PUBLIC_URL ?? "";
    const allowedOrigins = new Set([
      baseUrl,
      baseUrl.replace("://www.", "://"),
      baseUrl.replace("://", "://www."),
    ].filter(Boolean));
    const isVercelPreview = origin.endsWith(".vercel.app");
    if (!allowedOrigins.has(origin) && !isVercelPreview) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  try {
    const { plan } = await req.json() as { plan?: string };
    const priceId =
      plan === "annual"
        ? process.env.STRIPE_ANNUAL_PRICE_ID!
        : process.env.STRIPE_MONTHLY_PRICE_ID!;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
      metadata: {
        product: "codegrid_pro",
      },
      subscription_data: {
        metadata: {
          product: "codegrid_pro",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
