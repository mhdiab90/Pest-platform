# Pest Platform — Google Apps Script Drive Gateway (Pilot)

This gateway supports the complete, reversible Pest Platform attachment route after an administrator explicitly enables it. The same signed server-to-server gateway handles new uploads, preview/download, replacement, and deletion for both new and existing attachment records.

## What it does

- Runs as the Google account that deploys the Apps Script Web App.
- Exposes signed server-to-server operations: `ping`, `upload`, `download`, `replace`, and `delete`.
- Stores no Firebase token, Google refresh token, or application user credentials.
- Uses the exact folder ID already recorded by Pest Platform whenever it is available; only falls back to exact-name discovery when no folder ID exists.
- Uses an HMAC-SHA256 signature, a five-minute timestamp window, and a locked nonce replay check.
- Keeps all application permissions and attachment metadata in the existing Cloudflare Worker/Durable Object design. The browser/mobile app must never call this Apps Script URL directly.

## Full-route transfer and performance limit

The application supports files up to 20 MiB. Binary data is transferred as Base64 inside signed JSON because Apps Script `ContentService` returns text output; a 20 MiB file becomes roughly 26.7 MiB before envelope overhead. The recorded 20 MiB endurance test succeeded, but measured approximately 107 seconds for upload and 105 seconds for replacement. Large files are therefore materially slower than the former direct route; routine attachments should be kept smaller when practical.

Google's six-minute Apps Script execution ceiling is not a guarantee that a Web App request/response of this size will always be accepted or fast. The full route preserves the existing 20 MiB application limit, verifies the company account and folder for every file operation, and never silently retries an ambiguous gateway failure through a second storage route. If Apps Script is unavailable, users receive an error rather than risking duplicate files or inconsistent metadata. An administrator can disable the full route and return all file operations to the existing direct Google Drive API.

## Security and Google Drive permission

The supplied manifest requests the broad `https://www.googleapis.com/auth/drive` scope. This pilot uses Apps Script `DriveApp` to reopen files that were created by the older, separate OAuth integration; the permission is not restricted to the `Pest Platform Attachments` folder. The script therefore runs with broad access to the deploying account's Drive files.

Do not authorize this project in a personal or mixed-use Drive account unless you deliberately accept that level of access. If the company account also contains unrelated private files, stop before authorization and evaluate a separate company storage account with the existing attachments folder explicitly shared to it. The gateway must still be tested against the old files before any switch.

The Web App must allow anonymous network access for Cloudflare to call it without a Google browser session; the HMAC signature is the application-level gate. In the Apps Script deployment access setting, choose **Anyone** / anonymous access (Google manifest enum: `ANYONE_ANONYMOUS`), not an option that requires a signed-in Google account (`ANYONE`). Google distinguishes these two modes explicitly. If anonymous access is blocked by Google Workspace policy, do not weaken the account policy just to force this pilot.

## Deploy the pilot

1. Open [Google Apps Script](https://script.google.com/) while signed in to the **same company Google account that owns the existing Pest Platform attachments**.
2. Create a standalone project named `Pest Platform Drive Gateway`.
3. Add the content of `Code.gs` as the script file. In Project Settings, enable **Show "appsscript.json" manifest file in editor**, then replace the manifest with the version in this folder.
4. In Project Settings → Script Properties, add:
   - Property: `GATEWAY_SECRET`
   - Value: a newly generated random secret with at least 32 characters (use 64 hexadecimal characters).
5. Save, then run `runGatewayDriveSelfTest` from the editor and approve the requested Google Drive permission. The test creates a tiny temporary file, validates its bytes, and moves it to Trash.
6. Deploy → New deployment → Web app:
   - Execute as: **Me**
   - Who has access: **Anyone** (anonymous access, not “Anyone with a Google account”), only if your Google account / Workspace policy allows it.
   - Deploy and copy the URL ending in `/exec`.
7. In the Cloudflare dashboard, open Workers & Pages → `pest-platform` → Settings → Variables and Secrets, then add:
   - `GOOGLE_DRIVE_GATEWAY_URL` as a Text variable containing the deployed Web App URL ending in `/exec`.
   - `GOOGLE_DRIVE_GATEWAY_SECRET` as a Secret containing the same random value as the Apps Script `GATEWAY_SECRET` Script Property.
8. Deploy the Worker after adding those two values. Do not put the secret in GitHub, Firebase, `index.html`, the Android app, or this chat.
9. Open Pest Platform → Attachments → Google Drive connection → **Test connection** (administrator only). A successful result must show the same company email and confirm the existing attachments folder. If the email differs, stop and redeploy Apps Script as the original company Drive account.

The Web App URL is not itself a secret, but treat it as internal configuration. Keep the HMAC secret private.

Generate a secret locally in PowerShell without sharing it:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$secret = ([System.BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
$secret
```

Use the same secret value in Apps Script Script Properties and the Cloudflare Worker secret. Do not paste it into chat or GitHub.

## Verify the account and folder

The authenticated `ping` action returns the Apps Script effective account email and the folder ID. Compare the returned email with the company Google account previously connected in Pest Platform. Do not continue if they differ. The gateway searches for the existing folder by the exact name `Pest Platform Attachments` before creating a new one.

## What is deliberately not changed

- The existing Durable Object attachment metadata, entity links, notes, permissions, and audit ownership; they remain the system of record.
- Existing Drive files and their folder. Enabling the route does not copy, bulk-migrate, or rewrite existing records; existing `driveFileId` values are read through the gateway.
- The 20 MiB maximum attachment size and supported file types.
- The reversible direct Google Drive API route, which remains available when an administrator disables the gateway mode.
- A silent automatic fallback after an ambiguous gateway failure. Apps Script may have completed a Drive operation even if its response was lost, so a second upload or delete is not attempted automatically.
- Web and Android continue to use the same authenticated Cloudflare Worker endpoints.

The administrator-only endurance test covers 256 KiB, 1 MiB and 20 MiB tiers. Each tier performs upload, download with byte-for-byte verification, replacement, replacement verification and deletion. The maximum tier is a stress boundary, not a recommended everyday file size.

## Operational note

The prototype moves deleted/replaced Drive files to Trash rather than immediately purging them. This is intentionally recoverable during testing. The gateway's web-app deployment is publicly reachable at the network layer, so its HMAC secret must remain private and must be rotated if it is ever exposed.


## Complete in-app attachment route

The production Worker exposes an administrator-only setting at `/drive/gateway/upload-mode`, persisted in the existing Durable Object storage. It defaults to **disabled**. An administrator enables the full route from Settings → Attachments → Google Drive connection. The transition is deliberately explicit and reversible.

When full routing is enabled:
- Every new attachment up to **20 MiB** is uploaded through Apps Script.
- Preview and download for both old and new records are served through Apps Script.
- Replacement uploads a new file through Apps Script, updates the existing attachment record to the new Drive ID, and only then moves the previous file to Trash. The original remains intact if the metadata update cannot be confirmed.
- Deletion is carried out through Apps Script and then the existing metadata record is removed.
- Every file operation verifies that Apps Script is running as the exact connected company Google account and is pinned to the existing company attachments folder.
- Annotation, permissions, record ownership, cash-custody linking, and attachment metadata remain in the existing Cloudflare Worker / Durable Object. Web and Android continue to call the same authenticated Worker endpoints.
- If Apps Script fails or a response is ambiguous, the Worker never silently retries through the direct route. This avoids duplicate files and uncertain record links.

No existing files or attachment records need to be migrated: the gateway reads their existing Drive IDs in the same company folder. The direct Google Drive API route remains available as a reversible fallback when an administrator disables full routing. Files close to 20 MiB can take around 100 seconds to upload or replace based on the recorded endurance test; this is the known performance trade-off for the complete route.
