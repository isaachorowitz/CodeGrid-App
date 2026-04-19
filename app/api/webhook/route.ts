import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { Resend } from "resend";
import { getStripe } from "@/lib/stripe";

async function sendWelcomeEmail(email: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "CodeGrid <hello@codegrid.app>",
    to: email,
    subject: "Welcome to CodeGrid Pro",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Welcome to CodeGrid Pro</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;min-height:100vh;">
  <tr>
    <td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #2a2a2a;padding-bottom:20px;">
              <tr>
                <td>
                  <span style="font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:#e0e0e0;letter-spacing:0.05em;">CodeGrid</span>
                </td>
                <td align="right">
                  <span style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#555555;letter-spacing:0.08em;">SUBSCRIPTION CONFIRMED</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Status badge -->
        <tr>
          <td style="padding-bottom:28px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#0d1f0d;border:1px solid #1a3a1a;padding:6px 12px;">
                  <span style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#00c853;letter-spacing:0.1em;">&#x2713;&nbsp;&nbsp;PAYMENT COMPLETE</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Headline -->
        <tr>
          <td style="padding-bottom:8px;">
            <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;color:#e0e0e0;line-height:1.3;">
              Welcome to<br/>
              <span style="color:#ff8c00;">CodeGrid Pro.</span>
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:32px;">
            <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:12px;color:#888888;line-height:1.7;">
              Your subscription is active. Your license key is on its way.
            </p>
          </td>
        </tr>

        <!-- License key notice -->
        <tr>
          <td style="padding-bottom:6px;">
            <span style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#555555;letter-spacing:0.12em;text-transform:uppercase;">License Key</span>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#141414;border:1px solid #2a2a2a;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:12px;color:#e0e0e0;line-height:1.7;">
                    Your license key will arrive in a separate email from our licensing system
                    (<span style="color:#ff8c00;">noreply@keyforge.dev</span>) within a few minutes.
                    Check your spam folder if it doesn't appear.
                  </p>
                </td>
              </tr>
              <!-- Bottom accent bar -->
              <tr>
                <td style="height:2px;background-color:#ff8c00;"></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Links -->
        <tr>
          <td style="padding-bottom:6px;">
            <span style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#555555;letter-spacing:0.12em;text-transform:uppercase;">Quick Links</span>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #2a2a2a;">

              <tr>
                <td style="border-bottom:1px solid #2a2a2a;padding:14px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                        <span style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#e0e0e0;">Manage your license</span>
                      </td>
                      <td align="right">
                        <a href="https://keyforge.dev/portal/request?email=${encodeURIComponent(email)}" style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#ff8c00;text-decoration:none;font-weight:700;">Portal &#x2192;</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="border-bottom:1px solid #2a2a2a;padding:14px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                        <span style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#e0e0e0;">Download CodeGrid</span>
                      </td>
                      <td align="right">
                        <a href="https://codegrid.app/download" style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#ff8c00;text-decoration:none;font-weight:700;">Download &#x2192;</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:14px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                        <span style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#e0e0e0;">Need help?</span>
                      </td>
                      <td align="right">
                        <a href="mailto:support@codegrid.app" style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#ff8c00;text-decoration:none;font-weight:700;">support@codegrid.app &#x2192;</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #1a1a1a;padding-top:28px;padding-bottom:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <span style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#555555;">CodeGrid &copy; 2026</span>
                </td>
                <td align="right">
                  <span style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#555555;">support@codegrid.app</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.metadata?.product === "codegrid_pro") {
      const customerEmail = session.customer_details?.email;
      if (customerEmail) {
        await sendWelcomeEmail(customerEmail);
      }
    }
  }

  return NextResponse.json({ received: true });
}
