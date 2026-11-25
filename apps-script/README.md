# Pest Platform — Google Apps Script Drive Gateway (Pilot)

This is an isolated gateway prototype. It does **not** replace the live Cloudflare/Google Drive attachment flow yet.

## What it does

- Runs as the Google account that deploys the Apps Script Web App.
- Exposes signed server-to-server operations: `ping`, `upload`, `download`, `replace`, and `delete`.
- Stores no Firebase token, Google refresh token, or application user credentials.
- Reuses the existing `Pest Platform Attachments` folder when it can find it in the deploying account's Drive.
- Uses an HMAC-SHA256 signature, a five-minute timestamp window, and a locked nonce replay check.
- Keeps all application permissions and attachment metadata in the existing Cloudflare Worker/Durable Object design. The browser/mobile app must never call this Apps Script URL directly.

## Important pilot limitation

The current app supports files up to 20 MiB. This prototype uses Base64 JSON for binary transfer because Apps Script `ContentService` returns text output. A 20 MiB file becomes roughly 26.7 MiB of Base64 before JSON overhead.

Google documents a six-minute Apps Script execution ceiling, but that is **not** a guarantee that a Web App request/response of this size will be accepted or fast. Google does not publish a clear end-to-end Web App request/response size guarantee for this exact pattern. Therefore, do not switch production attachment traffic until we measure upload and preview round-trips with representative image, PDF, and 20 MiB files.

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
   - Who has access: **Anyone**, only if your Google account / Workspace policy allows it.
   - Deploy and copy the URL ending in `/exec`.
7. Keep the Web App URL and secret private. The next Cloudflare integration step will store them as Worker configuration/secrets. Never put the secret in this repository, in `index.html`, or in a browser/mobile setting.

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

The first gateway integration will be a protected connectivity check only. After that succeeds, the next step is to test small image/PDF transfers, then 1 MiB and 20 MiB files. Only after those results are acceptable should we route production operations through the gateway.

## Operational note

The prototype moves deleted/replaced Drive files to Trash rather than immediately purging them. This is intentionally recoverable during testing. The gateway's web-app deployment is publicly reachable at the network layer, so its HMAC secret must remain private and must be rotated if it is ever exposed.
