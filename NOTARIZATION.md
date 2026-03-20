# Apple Notarization — Status & Instructions

## Current Status: PENDING

The v0.1.0 .dmg is **signed** but **not yet notarized**. Users must right-click → Open on first launch.

- **Submission ID**: `a5bf1e1c-96f9-4a05-8c17-b57ad1aa0064`
- **Submitted**: 2026-03-20
- **Signing Identity**: `Developer ID Application: ZipLyne LLC (DHGG5BA7J7)`

## Check Status

```bash
xcrun notarytool info a5bf1e1c-96f9-4a05-8c17-b57ad1aa0064 \
  --apple-id "admin@ziplyne.agency" \
  --team-id DHGG5BA7J7 \
  --password "zimk-rmle-uvws-ovyl"
```

## When It Comes Back "Accepted"

### 1. Staple the ticket

```bash
xcrun stapler staple /Users/isaac/Code-Grid/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeGrid_0.1.0_aarch64.dmg
```

### 2. Update the GitHub Release

```bash
cd /Users/isaac/codegrid
gh release upload v0.1.0 \
  /Users/isaac/Code-Grid/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeGrid_0.1.0_aarch64.dmg \
  --clobber
```

### 3. Done

Users will no longer need to right-click → Open. macOS will trust the app immediately.

## If It Fails

### 1. Check the log

```bash
xcrun notarytool log a5bf1e1c-96f9-4a05-8c17-b57ad1aa0064 \
  --apple-id "admin@ziplyne.agency" \
  --team-id DHGG5BA7J7 \
  --password "zimk-rmle-uvws-ovyl"
```

Common failures:
- **Hardened runtime not enabled** — Add `--options runtime` to codesign
- **Unsigned binaries inside the bundle** — All embedded binaries must be signed
- **Forbidden entitlements** — Some entitlements aren't allowed with Developer ID

### 2. Fix the issue, then rebuild and resubmit

```bash
# Rebuild
cd /Users/isaac/Code-Grid
npm run tauri build -- --target aarch64-apple-darwin

# Resubmit
xcrun notarytool submit \
  src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeGrid_0.1.0_aarch64.dmg \
  --apple-id "admin@ziplyne.agency" \
  --team-id DHGG5BA7J7 \
  --password "zimk-rmle-uvws-ovyl" \
  --wait
```

### 3. On success, staple and re-upload (same steps as above)

## Credentials Reference

| Key | Value |
|-----|-------|
| Apple ID | `admin@ziplyne.agency` |
| Team ID | `DHGG5BA7J7` |
| App-Specific Password | `zimk-rmle-uvws-ovyl` |
| Signing Identity | `Developer ID Application: ZipLyne LLC (DHGG5BA7J7)` |
| Certificate SHA-1 | `8DC04133EBA533EA61EF5730F68C3D27E17F9C67` |

## Future Releases

For each new version:

```bash
# 1. Build
cd /Users/isaac/Code-Grid
npm run tauri build -- --target aarch64-apple-darwin

# 2. Notarize
xcrun notarytool submit \
  src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeGrid_VERSION_aarch64.dmg \
  --apple-id "admin@ziplyne.agency" \
  --team-id DHGG5BA7J7 \
  --password "zimk-rmle-uvws-ovyl" \
  --wait

# 3. Staple
xcrun stapler staple src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeGrid_VERSION_aarch64.dmg

# 4. Release
cd /Users/isaac/codegrid
gh release create vVERSION \
  /Users/isaac/Code-Grid/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeGrid_VERSION_aarch64.dmg \
  --title "CodeGrid vVERSION"
```
