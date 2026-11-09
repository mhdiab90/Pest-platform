# Pest Platform AI Agent

The Cloudflare Worker is the trusted gateway between the signed-in Pest Platform user, the selected model provider, and Firebase Realtime Database.

## Providers

1. **Cloudflare Workers AI — GLM-4.7 Flash** (default). The current Workers Free allowance is 10,000 Neurons per day. Cloudflare documents function calling and zero data retention for this model. Requests fail when the free allowance is exhausted.
2. **OpenRouter Free Models Router** — model set to `openrouter/free`. It routes to available free models with tool support. Free variants are rate-limited (currently 50 requests/day and 20 requests/minute). Availability, selected models and provider data handling can change.

No provider API key is stored in Firebase, GitHub source code or the browser.

## Deploy the existing Worker

The app is already configured to call:

`https://pest-platform.ai-mhdiab90.workers.dev`

Open this existing Worker in Cloudflare Dashboard → **Workers & Pages** (the Worker name is expected to be `pest-platform`, under the `ai-mhdiab90` workers.dev subdomain). Do not create a second Worker or change its public URL.

1. Select the existing `pest-platform` Worker.
2. Open **Edit Code**, replace the full source with the complete current contents of `cloudflare/worker.js` from this repository, then **Save and Deploy**.
3. In **Settings → Bindings**, confirm a Workers AI binding named exactly `AI` exists. Keep the binding enabled for the default Cloudflare provider.
4. To enable OpenRouter, create an OpenRouter API key, then in the Worker open **Settings → Variables and Secrets → Add → Secret**. Set the variable name to `OPENROUTER_API_KEY` and paste the key as the secret value. Do not paste the key into Pest Platform, Firebase, GitHub source code or chat.
5. Deploy the Worker again after adding the secret.

GitHub Pages deployment updates the website only; it does **not** automatically deploy the Cloudflare Worker. The Worker source in this repository must be deployed separately from the Cloudflare dashboard.

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

This is a permission-controlled toolset, not a promise that every existing screen/function is automated yet. External WhatsApp or email sending, user/role/permission administration, direct edits to imported quotation/legacy ledger collections and exports are not included in this build.

## AI dashboards

- Ask the AI Agent to create a dashboard or visual report.
- The model must retrieve source data through the user's permitted search tools, then propose up to six widgets: metrics, bar charts and tables.
- Saving a dashboard requires the user to review the proposal and explicitly confirm it.
- Dashboards are stored in the user's private Durable Object workspace (up to 25 per user). They are snapshots: values reflect the time they were created. Ask the agent to rebuild a dashboard when updated figures are needed.

## Scheduled AI reports

- Users with **AI Agent → Use** permission can create up to 10 recurring read-only reports for themselves.
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

## Smoke tests

Open the Worker URL followed by `/health`. Expected JSON includes `ok: true` and a `providers` object. Then sign in to Pest Platform with a test user, grant **AI Agent → Use** and the necessary module permissions, try a read request, then try an add/edit request. Inspect the action card and confirm only when its description is correct. Test with a second user lacking those module permissions and verify that reads/writes are denied.
