# Pest Platform — Google Apps Script Drive Gateway (Pilot)

This is an isolated gateway prototype. It does **not** replace the live Cloudflare/Google Drive attachment flow yet.

## What it does

- Runs as the Google account that deploys the Apps Script Web App.
- Exposes signed server-to-server operations: `ping`, `upload`, `download`, `replace`, and `delete`.
- Stores no Firebase token, Google refresh token, or application user credentials.
- Uses the exact folder ID already recorded by Pest Platform whenever it is available; only falls back to exact-name discovery when no folder ID exists.
- Uses an HMAC-SHA256 signature, a five-minute timestamp window, and a locked nonce replay check.
- Keeps all application permissions and attachment metadata in the existing Cloudflare Worker/Durable Object design. The browser/mobile app must never call this Apps Script URL directly.

## Important pilot limitation

The current app supports files up to 20 MiB. This prototype uses Base64 JSON for binary transfer because Apps Script `ContentService` returns text output. A 20 MiB file becomes roughly 26.7 MiB of Base64 before JSON overhead.

Google documents a six-minute Apps Script execution ceiling, but that is **not** a guarantee that a Web App request/response of this size will be accepted or fast. Google does not publish a clear end-to-end Web App request/response size guarantee for this exact pattern. Therefore, do not switch production attachment traffic until we measure upload and preview round-trips with representative image, PDF, and 20 MiB files.

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

- Existing attachment records and their `driveFileId` values.
- Existing files in Google Drive.
- Current attachment upload, preview, replace, delete, annotation, and linking routes.
- Web and Android user interfaces.
- Current production OAuth connection and its encrypted refresh-token record.

The gateway pilot includes an administrator-only size-endurance test with three sequential PDF tiers: 256 KiB, 1 MiB and the current 20 MiB per-file ceiling. Each tier performs upload, download with byte-for-byte verification, replacement, replacement verification and deletion. The UI stops at the first failed tier and reports per-operation timings and cleanup status. Run the 20 MiB boundary tier separately from other application activity: Base64 JSON expands the body to roughly 26.7 MiB before envelope overhead, and Worker memory is finite. A successful test is a pilot measurement, not a production cutover approval; keep the existing production attachment routes until representative preview tests and web/Android regression checks are complete.

## Operational note

The prototype moves deleted/replaced Drive files to Trash rather than immediately purging them. This is intentionally recoverable during testing. The gateway's web-app deployment is publicly reachable at the network layer, so its HMAC secret must remain private and must be rotated if it is ever exposed.
