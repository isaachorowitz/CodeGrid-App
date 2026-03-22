use ed25519_dalek::{VerifyingKey, Signature, Verifier};
use sha2::{Sha256, Digest};

/// Ed25519 PUBLIC key for license verification.
/// The corresponding private key is kept server-side only (env var LICENSE_SIGNING_KEY).
/// A public key CANNOT be used to forge signatures — this is the entire point of
/// asymmetric cryptography.
const LICENSE_PUBLIC_KEY: [u8; 32] = [
    0x7f, 0x38, 0xab, 0x09, 0x6e, 0xc7, 0x78, 0xac,
    0xc3, 0xcf, 0x8d, 0x62, 0xfd, 0x7b, 0xfe, 0x84,
    0x09, 0x5e, 0x17, 0x10, 0xda, 0xf7, 0x26, 0xa4,
    0x99, 0xcd, 0xe3, 0x51, 0xa6, 0x19, 0x52, 0x4d,
];

/// Internal salt for trial integrity verification (not a signing secret —
/// only prevents casual SQLite edits; real protection is server-side activation).
const TRIAL_SALT: &[u8] = b"codegrid-trial-integrity-2026";

/// Trial: 14 days from first launch (9 panes). After trial, limited to 4 panes.
/// Licensed: up to 50 panes per workspace.

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct LicenseStatus {
    pub is_licensed: bool,
    pub is_trial: bool,
    pub trial_days_remaining: i64,
    pub license_key: Option<String>,
    pub max_panes: u32,
}

/// Validate a license key signed with Ed25519.
/// Format: CG-XXXXX-XXXXX-XXXXX.{base64url_ed25519_signature}
pub fn validate_license_key(key: &str) -> bool {
    let Some((payload, sig_b64)) = key.split_once('.') else {
        return false;
    };

    // Verify payload format: CG-XXXXX-XXXXX-XXXXX
    let segments: Vec<&str> = payload.split('-').collect();
    if segments.len() != 4 || segments[0] != "CG" {
        return false;
    }

    // Decode base64url signature (Ed25519 = 64 bytes)
    let sig_bytes = match base64_url_decode(sig_b64) {
        Some(b) if b.len() == 64 => b,
        _ => return false,
    };

    // Verify Ed25519 signature using embedded public key
    let Ok(verifying_key) = VerifyingKey::from_bytes(&LICENSE_PUBLIC_KEY) else {
        return false;
    };
    let Ok(signature) = Signature::from_slice(&sig_bytes) else {
        return false;
    };

    verifying_key.verify(payload.as_bytes(), &signature).is_ok()
}

/// Get the machine fingerprint (SHA-256 of hardware UUID + username).
/// Used to bind the trial to a specific machine so deleting the DB and
/// re-installing doesn't grant a fresh trial.
pub fn get_machine_id() -> String {
    let hw_uuid = get_hardware_uuid().unwrap_or_default();
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default();

    let mut hasher = Sha256::new();
    hasher.update(hw_uuid.as_bytes());
    hasher.update(b":");
    hasher.update(username.as_bytes());
    hex::encode(hasher.finalize())
}

/// Compute trial integrity signature — ties (date, machine) together so
/// editing one without the other is detectable.
fn trial_integrity_sig(date_str: &str, machine_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(TRIAL_SALT);
    hasher.update(date_str.as_bytes());
    hasher.update(b":");
    hasher.update(machine_id.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn get_license_status(db: &crate::db::Database) -> LicenseStatus {
    // Check if a valid license key is stored
    if let Some(key) = db.get_setting("license_key") {
        if !key.is_empty() && validate_license_key(&key) {
            return LicenseStatus {
                is_licensed: true,
                is_trial: false,
                trial_days_remaining: 0,
                license_key: Some(mask_license_key(&key)),
                max_panes: 50,
            };
        }
    }

    // Check trial status with integrity verification
    let machine_id = get_machine_id();
    let first_launch = db.get_setting("first_launch_date");
    let stored_sig = db.get_setting("trial_integrity");
    let stored_machine = db.get_setting("machine_id");
    let now = chrono::Utc::now();

    let first_launch_date = if let Some(date_str) = &first_launch {
        // Verify trial integrity — if date or machine was tampered, treat as expired
        let expected_sig = trial_integrity_sig(date_str, &machine_id);
        let sig_valid = stored_sig.as_deref() == Some(expected_sig.as_str());
        let machine_valid = stored_machine.as_deref() == Some(machine_id.as_str());

        if !sig_valid || !machine_valid {
            return LicenseStatus {
                is_licensed: false,
                is_trial: false,
                trial_days_remaining: 0,
                license_key: None,
                max_panes: 4,
            };
        }

        chrono::DateTime::parse_from_rfc3339(date_str)
            .map(|d| d.with_timezone(&chrono::Utc))
            .unwrap_or(now)
    } else {
        // First launch — record trial start with integrity signature
        let date_str = now.to_rfc3339();
        let sig = trial_integrity_sig(&date_str, &machine_id);
        let _ = db.set_setting("first_launch_date", &date_str);
        let _ = db.set_setting("trial_integrity", &sig);
        let _ = db.set_setting("machine_id", &machine_id);
        now
    };

    let days_elapsed = (now - first_launch_date).num_days();
    let trial_days = 14;
    let remaining = (trial_days - days_elapsed).max(0);

    if remaining > 0 {
        LicenseStatus {
            is_licensed: false,
            is_trial: true,
            trial_days_remaining: remaining,
            license_key: None,
            max_panes: 9, // Full access during trial
        }
    } else {
        LicenseStatus {
            is_licensed: false,
            is_trial: false,
            trial_days_remaining: 0,
            license_key: None,
            max_panes: 4, // Limited after trial — enough to be useful
        }
    }
}

/// Mask the license key for display (only show payload prefix, hide signature)
fn mask_license_key(key: &str) -> String {
    if let Some((payload, _)) = key.split_once('.') {
        format!("{payload}...")
    } else {
        "CG-*****".to_string()
    }
}

/// Decode base64url (no padding) to bytes
fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    URL_SAFE_NO_PAD.decode(input).ok()
}

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
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_default();
    Some(hostname)
}
