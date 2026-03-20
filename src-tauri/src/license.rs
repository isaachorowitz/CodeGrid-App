use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

// This secret is used for offline validation. In production you'd want this obfuscated.
const LICENSE_SECRET: &[u8] = b"codegrid-license-key-secret-2026";

/// Trial: 14 days from first launch. After trial, limited to 2 panes per workspace.
/// Licensed: unlimited panes (up to 9).

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct LicenseStatus {
    pub is_licensed: bool,
    pub is_trial: bool,
    pub trial_days_remaining: i64,
    pub license_key: Option<String>,
    pub max_panes: u32,
}

pub fn validate_license_key(key: &str) -> bool {
    // Format: CG-XXXXX-XXXXX-XXXXX-XXXXX
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 5 || parts[0] != "CG" {
        return false;
    }

    let payload = format!("{}-{}-{}-{}", parts[0], parts[1], parts[2], parts[3]);
    let expected_sig = parts[4];

    let mut mac = HmacSha256::new_from_slice(LICENSE_SECRET).expect("HMAC key");
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    let sig_bytes = result.into_bytes();
    let full_hex = hex::encode(sig_bytes);

    // Take first 5 chars of hex, uppercased
    let computed = full_hex[..5].to_uppercase();

    computed == expected_sig.to_uppercase()
}

pub fn generate_license_key() -> String {
    // Generate 3 random 5-char alphanumeric segments
    use uuid::Uuid;
    let id = Uuid::new_v4().to_string().replace('-', "").to_uppercase();
    let seg1 = &id[0..5];
    let seg2 = &id[5..10];
    let seg3 = &id[10..15];

    let payload = format!("CG-{}-{}-{}", seg1, seg2, seg3);

    let mut mac = HmacSha256::new_from_slice(LICENSE_SECRET).expect("HMAC key");
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    let sig_bytes = result.into_bytes();
    let full_hex = hex::encode(sig_bytes);
    let sig = full_hex[..5].to_uppercase();

    format!("{}-{}", payload, sig)
}

pub fn get_license_status(db: &crate::db::Database) -> LicenseStatus {
    // Check if a valid license key is stored
    if let Some(key) = db.get_setting("license_key") {
        if !key.is_empty() && validate_license_key(&key) {
            return LicenseStatus {
                is_licensed: true,
                is_trial: false,
                trial_days_remaining: 0,
                license_key: Some(key),
                max_panes: 9,
            };
        }
    }

    // Check trial status
    let first_launch = db.get_setting("first_launch_date");
    let now = chrono::Utc::now();

    let first_launch_date = if let Some(date_str) = first_launch {
        chrono::DateTime::parse_from_rfc3339(&date_str)
            .map(|d| d.with_timezone(&chrono::Utc))
            .unwrap_or(now)
    } else {
        // First launch — record it
        let _ = db.set_setting("first_launch_date", &now.to_rfc3339());
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
            max_panes: 2, // Limited after trial
        }
    }
}
