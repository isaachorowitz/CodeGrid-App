// Keyforge API base URL
const KEYFORGE_BASE = "https://keyforge.dev/api/v1";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.KEYFORGE_API_KEY}`,
  };
}

/** Create a private portal session URL for a customer (48h validity) */
export async function createPortalSession(email: string): Promise<string> {
  const res = await fetch(`${KEYFORGE_BASE}/portal/sessions/private`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Keyforge portal error: ${res.status}`);
  const data = await res.json();
  return data.url as string;
}
