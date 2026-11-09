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

This is a permission-controlled first toolset, not a promise that every existing screen/function is automated yet. External WhatsApp or email sending, user/role/permission administration, direct edits to imported quotation/legacy ledger collections, exports, and scheduled/recurring AI jobs are not included in this build. Those require separate integrations and additional workflows.

## Safeguards

- Read tools are omitted from the model request when the user lacks the relevant View permission.
- The Worker also checks the relevant permission when a tool executes; the UI does not grant or elevate a user's rights.
- Every write action is staged first. No proposed write is saved until the user explicitly confirms it.
- On confirmation, the Worker reloads the latest user profile and checks the matching permission again before writing.
- The Worker uses the user's Firebase ID token for all database requests, so Firebase Security Rules also apply.
- Supported writes are recorded in the existing Firebase `logs` path.
- User-supplied content and database text are treated as untrusted data, not as instructions.
- No AI Agent operation can change roles, permissions, passwords, Firebase rules, provider settings or API secrets.

## API routes

- `GET /health` — provider availability and service status.
- `POST /agent` — ask the selected model to answer and/or prepare actions.
- `POST /execute` — re-check permissions and execute confirmed actions.
- `POST /ask` — compatibility alias for the agent route.

## Smoke tests

Open the Worker URL followed by `/health`. Expected JSON includes `ok: true` and a `providers` object. Then sign in to Pest Platform with a test user, grant **AI Agent → Use** and the necessary module permissions, try a read request, then try an add/edit request. Inspect the action card and confirm only when its description is correct. Test with a second user lacking those module permissions and verify that reads/writes are denied.
