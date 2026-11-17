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
