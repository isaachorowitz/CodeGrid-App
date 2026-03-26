//! Keyforge-based license validation for CodeGrid.
//!
//! Flow:
//!   activate   → POST /api/v1/public/licenses/activate  → cache in DB
//!   validate   → POST /api/v1/public/licenses/validate  → refresh cache
//!   deactivate → DELETE /api/v1/public/licenses/device  → clear DB
//!
//! Offline grace: 14 days from last successful online validation.
//! Free tier:     max 3 panes, permanent (no time limit, no account needed).

use sha2::{Sha256, Digest};

/// Keyforge product ID — replace with your real product ID from
/// https://keyforge.dev after creating a product in the dashboard.
const KEYFORGE_PRODUCT_ID: &str = "p_CHANGEME";

/// Base URL for the Keyforge public API (no auth key required).
const KEYFORGE_API: &str = "https://keyforge.dev/api/v1/public";

/// Days the app works offline using a cached valid validation.
const OFFLINE_GRACE_DAYS: i64 = 14;

pub const MAX_PANES_FREE: u32 = 3;
pub const MAX_PANES_PRO: u32 = 50;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct LicenseStatus {
    pub is_licensed: bool,
    pub is_trial: bool,              // always false — kept for interface compat
    pub trial_days_remaining: i64,   // always 0   — kept for interface compat
    pub license_key: Option<String>, // masked key for display
    pub max_panes: u32,
    pub subscription_expires_at: Option<String>,
    pub keyforge_status: Option<String>, // "active" | "expired" | "revoked"
    pub is_offline_grace: bool,
}

impl LicenseStatus {
    pub fn free_tier() -> Self {
        LicenseStatus {
            is_licensed: false,
            is_trial: false,
            trial_days_remaining: 0,
            license_key: None,
            max_panes: MAX_PANES_FREE,
            subscription_expires_at: None,
            keyforge_status: None,
            is_offline_grace: false,
        }
    }

    pub fn pro_tier(key: &str, expires_at: Option<String>, offline_grace: bool) -> Self {
        LicenseStatus {
            is_licensed: true,
            is_trial: false,
            trial_days_remaining: 0,
            license_key: Some(mask_license_key(key)),
            max_panes: MAX_PANES_PRO,
            subscription_expires_at: expires_at,
            keyforge_status: Some("active".to_string()),
            is_offline_grace: offline_grace,
        }
    }
}

/// Mask a license key for safe display (show first segment only).
fn mask_license_key(key: &str) -> String {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() >= 2 {
        format!("{}-****-****", parts[0])
    } else {
        "****-****-****".to_string()
    }
}

/// Stable machine identifier: SHA-256 of (hardware UUID + username), 48 hex chars.
pub fn get_machine_id() -> String {
    let hw_uuid = get_hardware_uuid().unwrap_or_default();
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(hw_uuid.as_bytes());
    hasher.update(b":");
    hasher.update(username.as_bytes());
    hex::encode(hasher.finalize())[..48].to_string()
}

/// Human-readable device name sent to Keyforge for the device list.
fn get_device_name() -> String {
    std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "CodeGrid Mac".to_string())
}

// ── Sync helper — used by pane-creation (must not block async runtime) ───────

/// Read cached license state from DB without a network call.
/// Called from pane-creation enforcement which runs in a sync context.
pub fn get_cached_status(db: &crate::db::Database) -> LicenseStatus {
    let key = match db.get_setting("keyforge_license_key") {
        Some(k) if !k.is_empty() => k,
        _ => return LicenseStatus::free_tier(),
    };

    let status = db.get_setting("keyforge_status").unwrap_or_default();
    if status != "active" {
        return LicenseStatus::free_tier();
    }

    let last_validated = db.get_setting("keyforge_last_validated").unwrap_or_default();
    if !is_within_grace_period(&last_validated) {
        return LicenseStatus::free_tier();
    }

    let expires_at = db.get_setting("keyforge_expires_at");
    LicenseStatus::pro_tier(&key, expires_at, false)
}

fn is_within_grace_period(last_validated: &str) -> bool {
    if last_validated.is_empty() {
        return false;
    }
    let Ok(last) = chrono::DateTime::parse_from_rfc3339(last_validated) else {
        return false;
    };
    let elapsed = chrono::Utc::now() - last.with_timezone(&chrono::Utc);
    elapsed.num_days() < OFFLINE_GRACE_DAYS
}

// ── Async Keyforge API operations ────────────────────────────────────────────

/// Validate the stored license with Keyforge; update DB cache; return status.
/// Falls back to cached state if the network is unreachable.
pub async fn refresh_license_status(db: &crate::db::Database) -> LicenseStatus {
    let key = match db.get_setting("keyforge_license_key") {
        Some(k) if !k.is_empty() => k,
        _ => return LicenseStatus::free_tier(),
    };
    let device_id = get_machine_id();

    match keyforge_validate(&key, &device_id).await {
        Ok(resp) => {
            let is_valid = resp.get("isValid").and_then(|v| v.as_bool()).unwrap_or(false);
            let status_str = resp
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let expires_at = resp
                .get("license")
                .and_then(|l| l.get("expiresAt"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if is_valid && status_str == "active" {
                let now = chrono::Utc::now().to_rfc3339();
                let _ = db.set_setting("keyforge_status", "active");
                let _ = db.set_setting("keyforge_last_validated", &now);
                if let Some(ref exp) = expires_at {
                    let _ = db.set_setting("keyforge_expires_at", exp);
                }
                LicenseStatus::pro_tier(&key, expires_at, false)
            } else {
                let _ = db.set_setting("keyforge_status", &status_str);
                LicenseStatus::free_tier()
            }
        }
        Err(_) => {
            // Network unreachable — apply offline grace
            let last_validated = db.get_setting("keyforge_last_validated").unwrap_or_default();
            if is_within_grace_period(&last_validated) {
                let expires_at = db.get_setting("keyforge_expires_at");
                LicenseStatus::pro_tier(&key, expires_at, true)
            } else {
                LicenseStatus::free_tier()
            }
        }
    }
}

/// Activate a Keyforge license key on this device. Stores result in DB.
pub async fn activate_license_key(
    key: &str,
    db: &crate::db::Database,
) -> Result<LicenseStatus, String> {
    let device_id = get_machine_id();
    let device_name = get_device_name();

    let resp = keyforge_activate(key, &device_id, &device_name)
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let is_valid = resp
        .get("isValid")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !is_valid {
        let code = resp
            .get("error")
            .and_then(|e| e.get("code"))
            .and_then(|c| c.as_str())
            .unwrap_or("unknown");
        return Err(match code {
            "invalid_license" => "Invalid license key.".to_string(),
            "license_revoked" => "This license has been revoked.".to_string(),
            "license_expired" => {
                "License expired. Renew at codegrid.app/pricing.".to_string()
            }
            "max_devices_reached" => {
                "Device limit reached. Manage devices at keyforge.dev/portal/request.".to_string()
            }
            _ => "Activation failed. Check your key and try again.".to_string(),
        });
    }

    let status_str = resp
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("active");
    let expires_at = resp
        .get("license")
        .and_then(|l| l.get("expiresAt"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let now = chrono::Utc::now().to_rfc3339();

    let _ = db.set_setting("keyforge_license_key", key);
    let _ = db.set_setting("keyforge_status", status_str);
    let _ = db.set_setting("keyforge_last_validated", &now);
    if let Some(ref exp) = expires_at {
        let _ = db.set_setting("keyforge_expires_at", exp);
    }

    Ok(LicenseStatus::pro_tier(key, expires_at, false))
}

/// Deactivate this device from Keyforge and clear local cache.
pub async fn deactivate_license_key(db: &crate::db::Database) -> LicenseStatus {
    if let Some(key) = db
        .get_setting("keyforge_license_key")
        .filter(|k| !k.is_empty())
    {
        let device_id = get_machine_id();
        // Best-effort deactivation — don't block on network failure
        let _ = keyforge_deactivate(&key, &device_id).await;
    }
    let _ = db.set_setting("keyforge_license_key", "");
    let _ = db.set_setting("keyforge_status", "");
    let _ = db.set_setting("keyforge_last_validated", "");
    let _ = db.set_setting("keyforge_expires_at", "");
    LicenseStatus::free_tier()
}

// ── Raw HTTP calls ────────────────────────────────────────────────────────────

async fn keyforge_validate(
    key: &str,
    device_id: &str,
) -> Result<serde_json::Value, reqwest::Error> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let resp = client
        .post(format!("{KEYFORGE_API}/licenses/validate"))
        .json(&serde_json::json!({
            "licenseKey": key,
            "deviceIdentifier": device_id,
            "productId": KEYFORGE_PRODUCT_ID,
        }))
        .send()
        .await?;
    Ok(resp.json().await.unwrap_or(serde_json::Value::Null))
}

async fn keyforge_activate(
    key: &str,
    device_id: &str,
    device_name: &str,
) -> Result<serde_json::Value, reqwest::Error> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let resp = client
        .post(format!("{KEYFORGE_API}/licenses/activate"))
        .json(&serde_json::json!({
            "licenseKey": key,
            "deviceIdentifier": device_id,
            "deviceName": device_name,
            "productId": KEYFORGE_PRODUCT_ID,
        }))
        .send()
        .await?;
    Ok(resp.json().await.unwrap_or(serde_json::Value::Null))
}

async fn keyforge_deactivate(key: &str, device_id: &str) -> Result<(), reqwest::Error> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    client
        .delete(format!("{KEYFORGE_API}/licenses/device"))
        .json(&serde_json::json!({
            "licenseKey": key,
            "deviceIdentifier": device_id,
            "productId": KEYFORGE_PRODUCT_ID,
        }))
        .send()
        .await?;
    Ok(())
}

// ── Platform: hardware UUID ───────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn get_hardware_uuid() -> Option<String> {
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.contains("IOPlatformUUID") {
            if let Some(uuid) = line.split('"').nth(3) {
                return Some(uuid.to_string());
            }
        }
    }
    None
}

#[cfg(not(target_os = "macos"))]
fn get_hardware_uuid() -> Option<String> {
    Some(
        std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_default(),
    )
}
