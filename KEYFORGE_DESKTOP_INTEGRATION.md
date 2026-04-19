# Keyforge Licensing Integration Guide
## CodeGrid Desktop (Tauri/Rust)

This guide covers every change required to migrate CodeGrid Desktop from local Ed25519 key validation to Keyforge-managed subscription licensing.

---

## Table of Contents

1. [Keyforge Dashboard Setup](#1-keyforge-dashboard-setup)
2. [Rust Changes — src-tauri/src/license.rs](#2-rust-changes)
3. [Cargo.toml Additions](#3-cargotoml-additions)
4. [TypeScript Changes — src/lib/ipc.ts](#4-typescript-changes)
5. [LicenseDialog.tsx Changes](#5-licensedialogtsx-changes)
6. [TrialBanner.tsx Changes](#6-trialbannertsx-changes)
7. [Settings.tsx Changes](#7-settingstsx-changes)
8. [Environment and Config](#8-environment-and-config)

---

## 1. Keyforge Dashboard Setup

Log in to [https://keyforge.dev](https://keyforge.dev) and complete the following before writing any code.

### Create a Product

- Go to **Products → New Product**.
- Set name: `CodeGrid Pro`.
- Set type: **Subscription** (not perpetual).
- Enable **Device Activation** and set **Max Devices per License** to `5` (adjust to taste).
- Enable **Offline Grace Period** and set it to `14 days`.
- Note the generated **Product ID** (a UUID). You will hardcode this in Rust.

### Configure License Tokens

- Under the product, open **Token Settings**.
- Set token format to **JWT**.
- Set token expiry to `24 hours` (validation will refresh on startup and every 24 h).
- Keyforge will sign tokens with its own keypair — you do not need to manage keys yourself.

### Connect Stripe

- Go to **Billing → Stripe Integration**.
- Connect your Stripe account.
- Create two Stripe prices and map them in the Keyforge billing panel:
  - Monthly: `$7.99/month`
  - Annual: `$79/year`
- Keyforge will automatically issue and revoke license keys when Stripe subscription events fire.

### Obtain Your Public Key for JWT Verification

- Under **Developer → API Keys**, copy your **Public Verification Key** (PEM format).
- This is used in Rust to verify JWT signatures offline without hitting the network.
- Store it as a compile-time constant in Rust (see Section 2).

---

## 2. Rust Changes

Replace the contents of `src-tauri/src/license.rs` entirely. The new file is structured in five sections: types, keychain helpers, API calls, JWT verification, and Tauri commands.

### 2.1 Full Replacement — src-tauri/src/license.rs

```rust
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Hardcode the Keyforge product ID from your dashboard (never a secret).
const KEYFORGE_PRODUCT_ID: &str = "YOUR-PRODUCT-UUID-HERE";
const KEYFORGE_API_BASE: &str = "https://keyforge.dev/api/v1/public";

/// PEM public key copied from Keyforge dashboard → Developer → API Keys.
/// Used to verify JWT tokens offline without a network call.
const KEYFORGE_PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
<paste your PEM here>
-----END PUBLIC KEY-----";

const KEYCHAIN_SERVICE: &str = "dev.codegrid.app";
const KEYCHAIN_LICENSE_KEY_ACCOUNT: &str = "license_key";
const KEYCHAIN_JWT_ACCOUNT: &str = "license_jwt";

// Pane limits per tier
pub const PANE_LIMIT_FREE: u32 = 3;
pub const PANE_LIMIT_PRO: u32 = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Mirrors the shape exposed to the TypeScript front-end via IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub is_licensed: bool,
    pub is_free_tier: bool,
    pub license_key: Option<String>,
    /// ISO-8601 string, e.g. "2026-04-01T00:00:00Z"
    pub subscription_expires_at: Option<String>,
    /// Raw status string from Keyforge: "active" | "expired" | "suspended" | "offline_grace"
    pub keyforge_status: Option<String>,
    pub pane_limit: u32,
    pub error: Option<String>,
}

impl LicenseStatus {
    pub fn free_tier() -> Self {
        LicenseStatus {
            is_licensed: false,
            is_free_tier: true,
            license_key: None,
            subscription_expires_at: None,
            keyforge_status: None,
            pane_limit: PANE_LIMIT_FREE,
            error: None,
        }
    }

    pub fn pro(key: String, expires_at: Option<String>) -> Self {
        LicenseStatus {
            is_licensed: true,
            is_free_tier: false,
            license_key: Some(key),
            subscription_expires_at: expires_at,
            keyforge_status: Some("active".to_string()),
            pane_limit: PANE_LIMIT_PRO,
            error: None,
        }
    }

    pub fn error(msg: &str) -> Self {
        let mut status = LicenseStatus::free_tier();
        status.error = Some(msg.to_string());
        status
    }
}

// ---------------------------------------------------------------------------
// JWT claims shape (must match Keyforge token schema)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct KeyforgeClaims {
    /// Epoch seconds
    exp: u64,
    /// Epoch seconds
    iat: u64,
    sub: String,
    /// "active" | "expired" | "suspended"
    license_status: String,
    product_id: String,
    /// ISO-8601 subscription expiry
    subscription_expires_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Keychain helpers (macOS Keychain via `keyring` crate)
// ---------------------------------------------------------------------------

fn keychain_set(account: &str, value: &str) -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, account)
        .map_err(|e| e.to_string())?;
    entry.set_password(value).map_err(|e| e.to_string())
}

fn keychain_get(account: &str) -> Option<String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, account).ok()?;
    entry.get_password().ok()
}

fn keychain_delete(account: &str) {
    if let Ok(entry) = Entry::new(KEYCHAIN_SERVICE, account) {
        let _ = entry.delete_password();
    }
}

// ---------------------------------------------------------------------------
// Keyforge API calls
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct ActivateRequest<'a> {
    license_key: &'a str,
    product_id: &'a str,
    device_name: &'a str,
    device_fingerprint: &'a str,
}

#[derive(Deserialize)]
struct ActivateResponse {
    token: String,
    status: String,
    subscription_expires_at: Option<String>,
}

#[derive(Serialize)]
struct ValidateRequest<'a> {
    license_key: &'a str,
    product_id: &'a str,
    device_fingerprint: &'a str,
}

#[derive(Deserialize)]
struct ValidateResponse {
    token: String,
    status: String,
    subscription_expires_at: Option<String>,
}

/// Returns a stable device fingerprint. Uses macOS hardware UUID via `system_profiler`.
/// Falls back to a UUID stored in Keychain if the system call fails.
fn device_fingerprint() -> String {
    use std::process::Command;
    let output = Command::new("system_profiler")
        .args(["SPHardwareDataType"])
        .output();
    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if line.contains("Hardware UUID") {
                if let Some(uuid) = line.split(':').nth(1) {
                    return uuid.trim().to_string();
                }
            }
        }
    }
    // Fallback: generate once and persist
    if let Some(stored) = keychain_get("device_fingerprint") {
        return stored;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let _ = keychain_set("device_fingerprint", &id);
    id
}

fn device_name() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Mac".to_string())
}

/// Calls POST /api/v1/public/licenses/activate and stores the resulting JWT.
/// Returns the new LicenseStatus on success, or an error string on failure.
pub async fn activate_license(license_key: &str) -> Result<LicenseStatus, String> {
    let client = Client::new();
    let fingerprint = device_fingerprint();
    let body = ActivateRequest {
        license_key,
        product_id: KEYFORGE_PRODUCT_ID,
        device_name: &device_name(),
        device_fingerprint: &fingerprint,
    };

    let response = client
        .post(format!("{KEYFORGE_API_BASE}/licenses/activate"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error during activation: {e}"))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Activation failed ({status}): {text}"));
    }

    let data: ActivateResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid activation response: {e}"))?;

    // Persist key and token in Keychain
    keychain_set(KEYCHAIN_LICENSE_KEY_ACCOUNT, license_key)?;
    keychain_set(KEYCHAIN_JWT_ACCOUNT, &data.token)?;

    Ok(LicenseStatus::pro(
        license_key.to_string(),
        data.subscription_expires_at,
    ))
}

/// Calls POST /api/v1/public/licenses/validate with the stored key.
/// If offline or the token is not expired, falls back to offline JWT verification.
pub async fn validate_license() -> LicenseStatus {
    let Some(license_key) = keychain_get(KEYCHAIN_LICENSE_KEY_ACCOUNT) else {
        return LicenseStatus::free_tier();
    };

    // Attempt online validation first
    match try_online_validate(&license_key).await {
        Ok(status) => status,
        Err(_) => {
            // Fall back to cached JWT offline verification
            offline_validate(&license_key)
        }
    }
}

async fn try_online_validate(license_key: &str) -> Result<LicenseStatus, String> {
    let client = Client::new();
    let fingerprint = device_fingerprint();
    let body = ValidateRequest {
        license_key,
        product_id: KEYFORGE_PRODUCT_ID,
        device_fingerprint: &fingerprint,
    };

    let response = client
        .post(format!("{KEYFORGE_API_BASE}/licenses/validate"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        let status_code = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Validation failed ({status_code}): {text}"));
    }

    let data: ValidateResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid validation response: {e}"))?;

    // Refresh the stored JWT with the new one
    let _ = keychain_set(KEYCHAIN_JWT_ACCOUNT, &data.token);

    if data.status == "active" {
        Ok(LicenseStatus::pro(
            license_key.to_string(),
            data.subscription_expires_at,
        ))
    } else {
        let mut status = LicenseStatus::free_tier();
        status.keyforge_status = Some(data.status);
        Ok(status)
    }
}

/// Verifies the cached JWT signature and expiry without any network access.
/// Respects the 14-day offline grace period beyond the token's exp claim.
fn offline_validate(license_key: &str) -> LicenseStatus {
    let Some(jwt) = keychain_get(KEYCHAIN_JWT_ACCOUNT) else {
        return LicenseStatus::free_tier();
    };

    let decoding_key = match DecodingKey::from_rsa_pem(KEYFORGE_PUBLIC_KEY_PEM.as_bytes()) {
        Ok(k) => k,
        Err(_) => return LicenseStatus::error("Internal error: invalid public key"),
    };

    let mut validation = Validation::new(Algorithm::RS256);
    // Disable built-in exp check so we can apply the grace period manually
    validation.validate_exp = false;

    let token_data = match decode::<KeyforgeClaims>(&jwt, &decoding_key, &validation) {
        Ok(d) => d,
        Err(_) => return LicenseStatus::free_tier(),
    };

    let claims = token_data.claims;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    const GRACE_SECONDS: u64 = 14 * 24 * 60 * 60; // 14 days
    if now > claims.exp + GRACE_SECONDS {
        // Beyond grace period — treat as free tier
        let mut status = LicenseStatus::free_tier();
        status.keyforge_status = Some("offline_grace_expired".to_string());
        return status;
    }

    if claims.license_status != "active" {
        let mut status = LicenseStatus::free_tier();
        status.keyforge_status = Some(claims.license_status);
        return status;
    }

    let mut status = LicenseStatus::pro(license_key.to_string(), claims.subscription_expires_at);
    if now > claims.exp {
        // Within grace period
        status.keyforge_status = Some("offline_grace".to_string());
    }
    status
}

/// Calls DELETE /api/v1/public/licenses/device to deactivate this device,
/// then clears stored credentials from the Keychain.
pub async fn deactivate_license() -> Result<(), String> {
    let Some(license_key) = keychain_get(KEYCHAIN_LICENSE_KEY_ACCOUNT) else {
        return Ok(()); // Nothing to deactivate
    };

    let client = Client::new();
    let fingerprint = device_fingerprint();

    #[derive(Serialize)]
    struct DeactivateRequest<'a> {
        license_key: &'a str,
        product_id: &'a str,
        device_fingerprint: &'a str,
    }

    let body = DeactivateRequest {
        license_key: &license_key,
        product_id: KEYFORGE_PRODUCT_ID,
        device_fingerprint: &fingerprint,
    };

    // Best-effort — clear local state regardless of network outcome
    let result = client
        .delete(format!("{KEYFORGE_API_BASE}/licenses/device"))
        .json(&body)
        .send()
        .await;

    keychain_delete(KEYCHAIN_LICENSE_KEY_ACCOUNT);
    keychain_delete(KEYCHAIN_JWT_ACCOUNT);

    match result {
        Ok(r) if r.status().is_success() => Ok(()),
        Ok(r) => Err(format!("Deactivation returned {}", r.status())),
        Err(e) => {
            // Credentials already cleared locally; treat as success for UX purposes
            eprintln!("Deactivation network error (credentials cleared locally): {e}");
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands (registered in main.rs)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_activate_license(key: String) -> Result<LicenseStatus, String> {
    activate_license(&key).await
}

#[tauri::command]
pub async fn cmd_validate_license() -> LicenseStatus {
    validate_license().await
}

#[tauri::command]
pub async fn cmd_deactivate_license() -> Result<(), String> {
    deactivate_license().await
}
```

### 2.2 Register Commands in main.rs

In `src-tauri/src/main.rs`, add the three new commands to `tauri::generate_handler!`:

```rust
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        // ... existing commands ...
        license::cmd_activate_license,
        license::cmd_validate_license,
        license::cmd_deactivate_license,
    ])
```

### 2.3 Startup Validation

In your app initialization (typically after the main window is created), trigger validation:

```rust
tauri::Builder::default()
    .setup(|app| {
        let app_handle = app.handle();
        tauri::async_runtime::spawn(async move {
            let status = license::validate_license().await;
            // Emit to front-end so UI can update without requiring a page reload
            let _ = app_handle.emit_all("license-status-updated", &status);
        });
        Ok(())
    })
```

---

## 3. Cargo.toml Additions

Open `src-tauri/Cargo.toml` and add the following to `[dependencies]`:

```toml
[dependencies]
# HTTP client for Keyforge API calls
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }

# JWT verification for offline validation
jsonwebtoken = "9"

# macOS Keychain access
keyring = { version = "3", features = ["apple-native"] }

# Stable device fingerprint fallback
uuid = { version = "1", features = ["v4"] }

# Hostname for device_name()
hostname = "0.4"

# Async runtime (already present in most Tauri apps — skip if duplicate)
tokio = { version = "1", features = ["full"] }
```

**Notes:**
- Use `rustls-tls` instead of `native-tls` to avoid OpenSSL linking issues on macOS.
- `keyring` with `apple-native` uses the macOS Security framework directly and writes to the user's login Keychain — no additional entitlements are required for sandboxed apps beyond `keychain-access-groups` if you have one.
- Remove the old `ed25519-dalek` or `ring` dependency if it is no longer used after replacing `license.rs`.

---

## 4. TypeScript Changes — src/lib/ipc.ts

Replace the existing `LicenseStatus` interface and add the three new IPC command wrappers.

```typescript
// src/lib/ipc.ts

export interface LicenseStatus {
  isLicensed: boolean;
  isFreeTier: boolean;
  licenseKey: string | null;
  /** ISO-8601 date string, e.g. "2026-04-01T00:00:00Z" */
  subscriptionExpiresAt: string | null;
  /** "active" | "expired" | "suspended" | "offline_grace" | "offline_grace_expired" | null */
  keyforgeStatus: string | null;
  /** 3 for free tier, 50 for Pro */
  paneLimit: number;
  error: string | null;
}

// Replace or add alongside existing license commands:

export async function activateLicense(key: string): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("cmd_activate_license", { key });
}

export async function validateLicense(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("cmd_validate_license");
}

export async function deactivateLicense(): Promise<void> {
  return invoke<void>("cmd_deactivate_license");
}
```

Remove the old `activateKey`, `validateKey`, or similarly named functions that called the Ed25519 path.

---

## 5. LicenseDialog.tsx Changes

### Pricing Copy

Replace the `$29` one-time price with subscription pricing:

```tsx
// Before
<p className="price">$29 one-time</p>

// After
<p className="price">$7.99 / month</p>
<p className="price-alt">or $79 / year — save 17%</p>
<a
  href="https://keyforge.dev/checkout/YOUR-PRODUCT-SLUG"
  target="_blank"
  rel="noreferrer"
  className="btn-secondary"
>
  Subscribe to get a key
</a>
```

### Activation UX

Replace the Ed25519 validation flow with the Keyforge activate call:

```tsx
import { activateLicense, LicenseStatus } from "@/lib/ipc";

// In the activation handler:
const handleActivate = async () => {
  setLoading(true);
  setError(null);
  try {
    const status = await activateLicense(licenseKey.trim());
    if (status.isLicensed) {
      onSuccess(status);
    } else {
      setError(status.error ?? "Activation failed. Check your key and try again.");
    }
  } catch (err) {
    setError(String(err));
  } finally {
    setLoading(false);
  }
};
```

### Input Placeholder

```tsx
<input
  placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
  value={licenseKey}
  onChange={(e) => setLicenseKey(e.target.value)}
/>
```

### Remove Trial Messaging

Remove any text referring to the 14-day trial, the one-time purchase, or the 9-pane trial limit. The dialog is now only shown when the user wants to upgrade from free to Pro.

---

## 6. TrialBanner.tsx Changes

The trial concept is replaced by a permanent free tier. The banner's job is now to invite free-tier users to upgrade, not to count down a deadline.

```tsx
// Before: showed "X days remaining in trial" or "Trial expired"

// After:
import { LicenseStatus } from "@/lib/ipc";

interface TrialBannerProps {
  licenseStatus: LicenseStatus;
  onUpgradeClick: () => void;
}

export function TrialBanner({ licenseStatus, onUpgradeClick }: TrialBannerProps) {
  if (licenseStatus.isLicensed) return null;

  const isOfflineGrace =
    licenseStatus.keyforgeStatus === "offline_grace" ||
    licenseStatus.keyforgeStatus === "offline_grace_expired";

  if (isOfflineGrace) {
    return (
      <div className="banner banner--warning">
        {licenseStatus.keyforgeStatus === "offline_grace"
          ? "You are offline. CodeGrid Pro features are available during the grace period."
          : "Offline grace period expired. Connect to the internet to restore Pro features."}
      </div>
    );
  }

  return (
    <div className="banner banner--info">
      You are on the <strong>Free tier</strong> — up to {licenseStatus.paneLimit} panes.{" "}
      <button className="btn-link" onClick={onUpgradeClick}>
        Upgrade to Pro
      </button>{" "}
      for 50 panes and all features.
    </div>
  );
}
```

Remove all references to `trialDaysRemaining`, `trialExpired`, and the 9-pane trial limit.

---

## 7. Settings.tsx Changes

### License Status Display

Replace the old license status block with one that shows subscription expiry and a manage link:

```tsx
import { validateLicense, deactivateLicense, LicenseStatus } from "@/lib/ipc";

// In the license section of Settings:

{licenseStatus.isLicensed ? (
  <div className="settings-section">
    <h3>CodeGrid Pro</h3>
    <p className="text-muted">
      Status:{" "}
      <span className="badge badge--green">
        {licenseStatus.keyforgeStatus === "offline_grace"
          ? "Active (offline grace)"
          : "Active"}
      </span>
    </p>
    {licenseStatus.subscriptionExpiresAt && (
      <p className="text-muted">
        Renews: {new Date(licenseStatus.subscriptionExpiresAt).toLocaleDateString()}
      </p>
    )}
    {licenseStatus.licenseKey && (
      <p className="text-muted text-mono text-sm">
        Key: {licenseStatus.licenseKey}
      </p>
    )}
    <div className="settings-actions">
      <a
        href="https://keyforge.dev/dashboard"
        target="_blank"
        rel="noreferrer"
        className="btn-secondary"
      >
        Manage subscription
      </a>
      <button
        className="btn-danger-ghost"
        onClick={handleDeactivate}
      >
        Deactivate on this device
      </button>
    </div>
  </div>
) : (
  <div className="settings-section">
    <h3>Free Tier</h3>
    <p className="text-muted">Up to {licenseStatus.paneLimit} panes.</p>
    <button className="btn-primary" onClick={() => setLicenseDialogOpen(true)}>
      Upgrade to Pro
    </button>
  </div>
)}
```

### Deactivation Handler

```tsx
const handleDeactivate = async () => {
  if (!confirm("Remove CodeGrid Pro from this device?")) return;
  try {
    await deactivateLicense();
    const status = await validateLicense();
    setLicenseStatus(status);
  } catch (err) {
    console.error("Deactivation error:", err);
  }
};
```

---

## 8. Environment and Config

### Product ID

The Keyforge **Product ID** is not a secret — it is a public identifier used to scope API requests. Hardcode it directly in `license.rs` as the `KEYFORGE_PRODUCT_ID` constant (shown in Section 2.1). There is no need for a `.env` file or a build-time variable for this value.

### Public Key PEM

Similarly, the Keyforge **Public Verification Key** (used for offline JWT validation) is a public key — safe to embed as a string constant in `license.rs`. Copy it from **Keyforge Dashboard → Developer → API Keys → Public Verification Key**.

### What is Never Stored or Hardcoded

- Stripe secret keys — handled entirely by Keyforge on the server.
- Keyforge API secret keys — not required for the public activation/validation endpoints.
- User license keys — stored only in the macOS Keychain (via `keyring`), never in `UserDefaults`, `localStorage`, or any plain-text file.
- JWTs — stored only in the macOS Keychain, never on disk.

### Tauri Capabilities (tauri.conf.json)

No special Tauri capability flags are required for Keychain access via the `keyring` crate on macOS. If you are distributing through the Mac App Store, add the `keychain-access-groups` entitlement in your `.entitlements` file:

```xml
<key>keychain-access-groups</key>
<array>
  <string>$(AppIdentifierPrefix)dev.codegrid.app</string>
</array>
```

For direct distribution (outside the App Store), no entitlement change is needed.

### Outbound Network Entitlement

Ensure `tauri.conf.json` allows outbound requests to `keyforge.dev`:

```json
{
  "tauri": {
    "allowlist": {
      "http": {
        "all": false,
        "request": true,
        "scope": ["https://keyforge.dev/**"]
      }
    }
  }
}
```

If you are on Tauri v2, this is configured in `capabilities/` using the `http:default` permission instead.

---

## Migration Checklist

- [ ] Create product in Keyforge dashboard and copy Product ID into `license.rs`
- [ ] Copy Keyforge public verification key PEM into `license.rs`
- [ ] Connect Stripe in Keyforge dashboard and create monthly/annual prices
- [ ] Replace `src-tauri/src/license.rs` with the new implementation above
- [ ] Add `reqwest`, `jsonwebtoken`, `keyring`, `uuid`, `hostname` to `Cargo.toml`
- [ ] Remove old `ed25519-dalek` / `ring` dependency if unused
- [ ] Register three new Tauri commands in `main.rs`
- [ ] Add startup validation + `license-status-updated` event emission in `main.rs`
- [ ] Update `LicenseStatus` interface in `src/lib/ipc.ts`
- [ ] Update `LicenseDialog.tsx` with new pricing copy and activation flow
- [ ] Update `TrialBanner.tsx` to show free-tier messaging instead of trial countdown
- [ ] Update `Settings.tsx` to show subscription expiry and manage/deactivate buttons
- [ ] Update any pane-limit checks in the app that reference the old `9` trial limit to use `licenseStatus.paneLimit`
- [ ] Test activation with a valid Keyforge test key
- [ ] Test offline validation by blocking network access after activation
- [ ] Test grace period expiry by manipulating the JWT exp in a dev build
- [ ] Test deactivation and re-activation on the same device
