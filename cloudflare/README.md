# Pest Platform AI Agent

The Cloudflare Worker is the trusted gateway between the signed-in Pest Platform user, the selected model provider, and Firebase Realtime Database.

## Providers

1. **Cloudflare Workers AI — GLM-4.7 Flash** (default). The current Workers Free allowance is 10,000 Neurons per day. Cloudflare documents function calling and zero data retention for this model. Requests fail when the free allowance is exhausted.
2. **OpenRouter Free Models Router** — model set to `openrouter/free`. It routes to available free models with tool support. Free variants are rate-limited (currently 50 requests/day and 20 requests/minute). Availability, selected models and provider data handling can change.

No provider API key is stored in Firebase, GitHub source code or the browser.

## Existing Cloudflare deployment

The application already calls the existing Worker at:

`https://pest-platform.ai-mhdiab90.workers.dev`

Cloudflare's GitHub integration is connected to this repository. Pushes to `main` that change `cloudflare/worker.js` or `wrangler.jsonc` are built and deployed to the existing Worker named `pest-platform`. Do not create a second Worker or change its URL. After a push, verify the **Workers Builds: pest-platform** check run is complete and successful.

The `wrangler.jsonc` file defines the existing AI binding (`AI`), the private scheduler Durable Object (`AI_AGENT_SCHEDULER`), its initial SQLite migration and a one-minute Cron Trigger.

To enable the alternative OpenRouter provider, create a key at OpenRouter and add it as a **Secret** named `OPENROUTER_API_KEY` under Cloudflare Dashboard → Workers & Pages → `pest-platform` → Settings → Variables and Secrets. The Cloudflare GitHub integration does not create this secret automatically. Never place it in Firebase, browser code, GitHub files or chat.

OpenRouter keys: https://openrouter.ai/keys
OpenRouter free models: https://openrouter.ai/collections/free-models/
Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
Cloudflare function calling: https://developers.cloudflare.com/workers-ai/features/function-calling/

## Deployment

The existing Cloudflare GitHub integration is connected to this repository and builds the Worker named `pest-platform` from pushes to `main`. The `wrangler.jsonc` file defines the Worker entry point and the Workers AI binding named `AI`.

After changing `cloudflare/worker.js`, push to `main` and check the **Workers Builds: pest-platform** check run on that commit. A completed successful Cloudflare build confirms that Worker code was deployed. GitHub Pages deployment is a separate check.

To enable OpenRouter, add `OPENROUTER_API_KEY` as a **Secret** in the existing Worker in Cloudflare Dashboard → Workers & Pages → `pest-platform` → Settings → Variables and Secrets. Do not place this key in Firebase, browser code or committed files. The existing Cloudflare GitHub integration does not automatically create this provider secret.

## App configuration

The administrator selects the active provider in Pest Platform → Settings → AI Agent. The selection is stored in `companyInfo/aiAgent/provider`; this value contains no secret. Cloudflare remains the default.

Users need the **AI Agent → Use** permission in User Permissions. The Worker independently verifies the Firebase ID token, active account and the current user's permissions; front-end visibility alone is not a security boundary.

## Current tools

**Read/search tools**, each checked against the signed-in user's permission:
- Customers and suppliers, including contact and registration details.
- Projects and their timeline/event details.
- Quotations, collection records and payment records when dashboard, statement or reports View access is available.
- Personal cash-custody transactions; other owners' transactions only with View Others permission.
- The signed-in user's tasks and mailbox, plus active user-directory lookups for internal messaging.

**Write proposals**, each requiring the user to review the action list and press Confirm:
- Create, update and delete customers and suppliers.
- Create, update and delete projects.
- Add, edit and delete project events, including customer receivables, supplier commitments, collections and supplier payments.
- Create, edit and delete the signed-in user's own pending cash-custody transactions; approve/reject another user's pending transaction only with the relevant approval permission.
- Create, update and delete the signed-in user's own tasks.
- Send an internal Pest Platform message to one active user.

This is a permission-controlled toolset, not a promise that every existing screen/function is automated yet. External email delivery, automated WhatsApp messages to customers/suppliers, user/role/permission administration, direct edits to imported quotation/legacy ledger collections and exports are not included in this build. The existing WhatsApp composer can still open manual `wa.me` drafts for employees, customers and suppliers; the sender must press Send inside WhatsApp.

## WhatsApp notifications for internal messages

The app can send a **notification only** from the company's registered WhatsApp Business Platform phone number after an internal Pest Platform message, reply or quick-chat is saved. This is separate from the existing manual `wa.me` composer.

### Required Cloudflare configuration

In Cloudflare Dashboard → Workers & Pages → `pest-platform` → Settings → Variables and Secrets, configure:

| Name | Type | Purpose |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Secret | Meta WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Variable | Numeric ID of the company's registered WhatsApp sender number |
| `WHATSAPP_GRAPH_API_VERSION` | Variable | Graph API version supported by the Meta app, e.g. the version enabled in your Meta developer dashboard |
| `WHATSAPP_NOTIFICATION_TEMPLATE_NAME` | Variable | Exact name of an approved Utility message template |
| `WHATSAPP_NOTIFICATION_TEMPLATE_LANGUAGE` | Variable | Exact language code approved for that template, e.g. `ar` or `en_US` |

Create and obtain Meta approval for a Utility template with **one body parameter** (`{{1}}`). The Worker passes the employee's sender name and the internal message subject as that parameter; it does not forward the full private message body to WhatsApp. The endpoint sends approved templates only, never arbitrary free-form text.

Employees must enter their WhatsApp number and explicitly enable **WhatsApp notifications** in Profile → Personal details. The Worker verifies the recipient's current active directory record and `whatsappOptIn === true` before contacting them. Employees can withdraw consent by unchecking the same box. Existing users are not opted in automatically.

The endpoint also verifies the sender's `messages.add` permission and confirms that the referenced message is already saved in that sender's Sent folder. A Durable Object claim prevents duplicate notification sends for the same message, and each sender is limited to five notification batches per minute. Recipients without opt-in or a valid number are skipped. A failed WhatsApp API request does not undo the internal Pest Platform message.

**Scope in this release:** automatic WhatsApp notifications cover internal messages, replies and quick chats addressed to opted-in employees. The manual `wa.me` composer remains available for employee/customer/supplier conversations and still requires the sender to press Send. Automated vendor/customer messages, task due-date alerts and user-registration alerts are not part of this release.

WhatsApp requires businesses to have the recipient's number and opt-in permission, and to initiate conversations using approved templates; free-form replies are limited to the 24-hour customer-service window. See the [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).
## AI dashboards

- Ask the AI Agent to create a dashboard or visual report.
- The model retrieves source data through the user's permitted search tools, then proposes up to six widgets: metrics, bar charts and tables. The Worker rejects a dashboard proposal unless each widget's source was retrieved successfully in the same request.
- A visual preview of the metrics, charts and tables is shown before saving. The user must review the proposal and explicitly confirm it.
- The Worker re-checks each widget source permission before saving. Dashboards are stored in the user's private Durable Object workspace (up to 25 per user).
- Dashboards are snapshots between refreshes. Each saved dashboard has a **Refresh data** control: the Agent re-reads every widget source allowed to that user, proposes updated metrics/charts/tables with the same dashboard ID, and replaces the saved snapshot in place only after the user previews and confirms it. The saved dashboard's original owner and creation timestamp are preserved; the last-updated timestamp changes.

## Scheduled AI reports

- Users with **AI Agent → Use** permission can create up to 10 recurring read-only reports for themselves.
- Each schedule can be paused and resumed by its owner. Resuming checks the owner's current permission for every saved data scope, validates the current Firebase refresh session belongs to that same user, and stores the renewed session encrypted. The raw refresh token is never returned to the browser's schedule list.
- Supported schedules are daily, weekly or monthly, using **Africa/Cairo** local time.
- Cloudflare Cron Triggers run every minute (UTC); the Worker calculates the next Cairo-local run time.
- A schedule stores an encrypted Firebase refresh token in the Durable Object. It is encrypted with AES-GCM using the Worker Secret `AI_SCHEDULER_ENCRYPTION_KEY`; the raw token is never returned to the browser or dashboard.
- On every run, the Worker refreshes that owner's Firebase session, reloads the active profile, and re-checks AI Agent Use and each selected data-scope permission. A disabled account, revoked AI permission or revoked selected scope causes the schedule to pause.
- Scheduled tasks are **read-only**. They may search and summarize selected permitted scopes, but cannot create/edit/delete/approve records, build or save dashboards, create tasks or send messages.
- Results and the last run status are kept in that user's private schedule list. They are visible the next time the user opens the AI Agent panel. Up to 10 run summaries are retained per schedule.

### One-time scheduler secret

Generate a random 32-byte key locally, for example:

```bash
openssl rand -base64 32
```

In Cloudflare Dashboard → Workers & Pages → `pest-platform` → Settings → Variables and Secrets, add a **Secret** named `AI_SCHEDULER_ENCRYPTION_KEY` and paste the generated value. Never put it in GitHub, Firebase, the application HTML or chat. Keep the same key: replacing or losing it makes previously stored encrypted schedule credentials unreadable; those schedules will need to be deleted and recreated. The Durable Object binding, SQLite migration and one-minute Cron Trigger are configured in `wrangler.jsonc` and are deployed with the Worker.

On Windows PowerShell, this equivalent command also generates a random 32-byte value:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

## Private Google Drive attachments

Pest Platform stores attachments in the company's Google Drive account. It does **not** use Supabase Storage, Firebase Storage, public Drive links, or Base64 files in Firebase.

### Free storage and limits

- A personal Google Account includes up to 15 GB shared across Google Drive, Gmail and Google Photos. Existing use by Gmail/Photos reduces the space available for Pest Platform files.
- The application enforces a **13 GiB internal attachment budget** as a safety margin; Google may reject uploads earlier when the connected account is already using storage elsewhere.
- Each file is limited to **20 MB**.
- Allowed file types: PDF, JPG/JPEG, PNG, WebP, DOC, DOCX, XLS, XLSX, CSV and TXT.
- PDF, images, CSV/TXT and Excel workbooks can be previewed in the app. Word documents and other non-previewable types are downloaded.
- The attachment folder is named \`Pest Platform Attachments\`.
- Files remain private in Drive. The browser does not receive a public Drive URL; the Worker checks the Firebase session and both the Attachments permission and the linked module permission before listing, uploading, viewing or deleting.
- File metadata is stored in the existing \`AI_AGENT_SCHEDULER\` Durable Object. Google OAuth refresh tokens are encrypted with AES-GCM before being stored there. OAuth client credentials and the encryption key remain Cloudflare Worker variables/secrets.

### One-time Google Cloud setup

1. Use a dedicated Google Account for the company's shared attachments. Check its current Google storage usage first.
2. Create a project in Google Cloud Console and enable the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
3. Configure the OAuth consent screen as an External app. Add an application name, support email and developer contact email. Publish it as **In production** before using it as the long-term company connection: refresh tokens issued while an External app is in Testing expire after seven days for these scopes.
4. Create an OAuth Client ID with application type **Web application**.
5. Add this exact authorized redirect URI to the OAuth client:

   \`https://pest-platform.ai-mhdiab90.workers.dev/drive/oauth/callback\`

6. In Cloudflare Dashboard → Workers & Pages → \`pest-platform\` → Settings → Variables and Secrets, add:

   | Name | Type | Value |
   |---|---|---|
   | \`GOOGLE_DRIVE_CLIENT_ID\` | Variable | OAuth client ID from Google Cloud |
   | \`GOOGLE_DRIVE_CLIENT_SECRET\` | Secret | OAuth client secret from Google Cloud |
   | \`GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY\` | Secret | Random 32-byte key encoded as Base64 |

   Generate the encryption key locally using \`openssl rand -base64 32\`, or generate 32 random bytes using a trusted local password manager. Never put the generated key or OAuth client secret in GitHub, Firebase, the HTML app or chat. Keep a secure backup of the encryption key; losing it makes the stored Drive refresh token unreadable and requires reconnecting Google Drive.

7. Deploy the updated Cloudflare Worker. Sign in to Pest Platform as a system administrator, open **Attachments**, then select **Connect Google Drive account** and approve the requested access.
8. Refresh the Attachments screen. The connection status should show the connected Google account. The first upload creates the private \`Pest Platform Attachments\` folder automatically.

The OAuth app requests only \`drive.file\` plus basic email identity. \`drive.file\` limits access to files created or opened by this application; it does not grant unrestricted access to the user's whole Drive.

### User permissions and operations

- In **Administration → User Permissions**, grant the user **Attachments → View** to access the screen.
- Also grant the matching linked module permission: Projects, Clients & Vendors, Tasks, Messages, or Reports/Finance.
- Grant **Attachments → Add** and the matching module's Add or Edit permission to allow uploads.
- Grant **Attachments → Delete** and the linked module's Edit/Delete permission to allow deletion.
- Company-wide attachments are administrator-only.
- The app supports links to projects, customers, suppliers, the signed-in user's tasks and mailbox messages, financial records, and administrator-only company files.
- Disconnecting Google Drive removes the stored app authorization but does not delete files from Drive or metadata from the app. Reconnect the same Google Account to restore access to the existing attachments. Do not connect a different account unless the files and metadata are migrated deliberately.

### Important storage note

The 13 GiB cap is an application safety limit, not a reservation of Google Drive capacity. Google Drive can still reject an upload if the account's combined Drive/Gmail/Photos storage is full. No Google billing account or bank card is required for a personal Google Account's included 15 GB storage. Google can change its product limits and OAuth requirements; review the current [Google storage information](https://support.google.com/drive/answer/6374270) and [OAuth web server guidance](https://developers.google.com/identity/protocols/oauth2/web-server) before changing the setup.

## Safeguards

- Read tools are omitted from the model request when the user lacks the relevant View permission.
- The Worker also checks the relevant permission when a tool executes; the UI does not grant or elevate a user's rights.
- Every write action is staged first. No proposed write is saved until the user explicitly confirms it.
- On confirmation, the Worker reloads the latest user profile and checks the matching permission again before writing.
- The Worker uses the user's Firebase ID token for all database requests, so Firebase Security Rules also apply.
- Supported writes are recorded in the existing Firebase `logs` path.
- User-supplied content and database text are treated as untrusted data, not as instructions.
- No AI Agent operation can change roles, permissions, passwords, Firebase rules, provider settings or API secrets.

## Important Firebase Rules security note

The AI Worker verifies the signed-in user's permissions before offering a read or write tool, and it uses that user's Firebase ID token for Realtime Database requests. However, the Firebase Rules currently supplied with this project allow any active account to read and write the top-level `clients`, `vendors`, `projects`, `quotes`, `inflows`, and `outflows` collections. That means the Agent respects the app permission matrix, but a determined user may still access these collections directly through Firebase outside the Agent. Before treating the permission matrix as a complete security boundary, tighten the Firebase Rules so each collection checks the corresponding per-user read/write permissions. Review and publish Firebase Rules manually in Firebase Console; this repository does not deploy them.

## API routes

- `GET /health` — provider availability and service status.
- `POST /agent` — ask the selected model to answer and/or prepare actions.
- `POST /execute` — re-check permissions and execute confirmed actions.
- `POST /ask` — compatibility alias for the agent route.
- `POST /whatsapp/notify-message` — send an approved, consent-checked company WhatsApp notification for a saved internal message.

## Smoke tests

Open the Worker URL followed by `/health`. Expected JSON includes `ok: true` and a `providers` object. Then sign in to Pest Platform with a test user, grant **AI Agent → Use** and the necessary module permissions, try a read request, then try an add/edit request. Inspect the action card and confirm only when its description is correct. Test with a second user lacking those module permissions and verify that reads/writes are denied.
