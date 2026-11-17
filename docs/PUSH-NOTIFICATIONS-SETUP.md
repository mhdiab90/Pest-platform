# Pest Platform push notifications setup

This change adds native Android FCM registration and Firebase Web Push. It deliberately does not contain a Firebase service-account private key.

## Cloudflare Worker settings

Open the Cloudflare dashboard, select the existing pest-platform Worker, then Settings → Variables and Secrets.

1. Add a Secret named FCM_SERVICE_ACCOUNT_JSON. In Firebase Console → Project settings → Service accounts, generate a private key for project pest-plat-form; paste the complete JSON file as the secret value. Do not commit or upload that private JSON to GitHub or the app.
2. Enable the Firebase Cloud Messaging API for the same Google Cloud project and ensure the service account has permission to send Firebase Cloud Messaging messages and read the project's Realtime Database.
3. Add a Text variable named FCM_WEB_VAPID_KEY. Generate the Web Push key pair in Firebase Console → Project settings → Cloud Messaging → Web Push certificates and use the public key only.

The Worker /push/config endpoint exposes only whether the sender is configured and the public VAPID key. It does not return the service-account secret.

## Firebase Realtime Database rules

Review firebase-rules/Pest-Platform-Firebase-Rules-Custody-v9-Push.json. It keeps the v8 rules and adds:
- pushTokens/{uid}/{tokenId}: only the active signed-in owner can write their own Android/web token; client reads are denied.
- pushDispatches: client reads and writes are denied; the Worker uses its service account for idempotency tracking.

The v9 file is a proposed rules file only. It has not been deployed to Firebase. Deploy it only after reviewing the full rules against the active production rules.

## Device enrollment and delivery

After the Worker is deployed and the v9 rules are deployed:
- Install the new Android build, sign into Pest Platform, open the bell → Enable device / browser push notifications, and allow Android notifications.
- On desktop, open Pest Platform over HTTPS, sign in, open the bell → Enable device / browser push notifications, and allow browser notifications.
- Each device/browser stores its own FCM token under the signed-in UID. Logging out removes that device's token from that UID.
- FCM notification previews contain only a generic alert. Message contents and financial values stay inside the authenticated app.
- Message notifications are verified against the sender's saved sent-copy. Cash-custody notifications are verified against both sides of the linked transaction before sending.

## Important deployment note

The GitHub changes do not automatically set Cloudflare secrets or publish Firebase database rules. Push delivery is not live until the two Worker settings above, the v9 Database Rules, and the Worker deployment are completed. The Android APK build is independent of the Cloudflare secret setup.


## Stable Android update signing (recommended)

The Android APK workflow can use a persistent debug signing key so subsequent APK builds can be installed as updates without uninstalling the app.

1. Save the provided `pest-platform-debug.keystore` outside the repository (for example in the project folder on your D: drive). Do not commit it.
2. In the repository, open Settings → Secrets and variables → Actions → New repository secret.
3. Name the secret `ANDROID_DEBUG_KEYSTORE_BASE64`. On PowerShell, generate its value using:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('D:\OneDrive\Pest\Pest Platform\Main Project\pest-platform-debug.keystore'))
```

4. Paste the resulting Base64 text as the secret value. The keystore uses alias `androiddebugkey` and the standard debug password `android`. Keep the file private.
5. Run the Android APK workflow again. The workflow uses increasing version codes and will use the same signing key on later builds.

The currently generated APKs that were built before this secret is configured use temporary runner keys. Moving from an APK signed with a different key requires a one-time uninstall/reinstall; Firebase cloud records are not deleted by that operation, but local app settings and session data may reset.
