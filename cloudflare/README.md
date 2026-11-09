# Pest Platform AI Agent

The Cloudflare Worker is the trusted gateway between the signed-in Pest Platform user, the selected model provider, and Firebase Realtime Database.

## Providers

1. **Cloudflare Workers AI — GLM-4.7 Flash** (default). The current Workers Free allowance is 10,000 Neurons per day. Cloudflare identifies this model as supporting function calling and zero data retention. Requests fail when the free allowance is exhausted.
2. **OpenRouter Free Models Router** — model set to `openrouter/free`. It routes to free models that support tools when available. Free model requests are rate-limited (currently 50 requests/day and 20 requests/minute for free variants). Free model availability and provider selection can change.

The Worker never stores provider API keys in Firebase or sends them to the browser.

## Deploy the Worker

1. Open Cloudflare Dashboard → **Workers & Pages** → select `pest-platform-ai`.
2. Open **Edit Code**, replace the Worker with the complete current contents of `cloudflare/worker.js`, then **Save and Deploy**.
3. In **Settings → Bindings**, confirm a Workers AI binding named exactly `AI` exists.
4. To enable OpenRouter, create a free OpenRouter API key, then in the Worker open **Settings → Variables and Secrets → Add → Secret**. Set the variable name to `OPENROUTER_API_KEY` and paste the key as the secret value. Do not paste the key into Pest Platform, Firebase, GitHub source code or chat.
5. Deploy the Worker again after adding the secret.

OpenRouter: https://openrouter.ai/keys
OpenRouter free models: https://openrouter.ai/collections/free-models/
Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
Cloudflare function calling: https://developers.cloudflare.com/workers-ai/features/function-calling/

## App configuration

The administrator selects the active provider in Pest Platform → Settings → AI Agent. The selection is stored in `companyInfo/aiAgent/provider`; this value contains no secret. Cloudflare remains the default.

Users need the **AI Agent → Use** permission in User Permissions. The Worker verifies the Firebase ID token, loads the current user's profile and permissions from Firebase, then exposes only the tools permitted to that user.

## Agent workflow and safeguards

- Read operations are executed only for modules where the signed-in user has View permission.
- Create, update, delete, project-event, task and internal-message actions are proposals. They are not written immediately.
- The user reviews the proposed action list and explicitly confirms execution.
- On confirmation, the Worker re-reads the current user profile and checks the required permission again before writing.
- Supported actions are logged to the existing Firebase `logs` path.
- Provider keys stay in Cloudflare Worker secrets. The browser receives neither API keys nor provider credentials.
- The agent does not change roles, permissions, passwords, Firebase rules or provider secrets. External WhatsApp/email sending is not available in this initial agent toolset.
- The Worker uses the user's own Firebase ID token for database requests, so Firebase Security Rules still apply.

## API routes

- `GET /health` — provider availability and service status.
- `POST /agent` — ask the selected model to answer and/or prepare actions.
- `POST /execute` — re-check user permissions and execute confirmed actions.
- `POST /ask` — compatibility alias for the agent route.

## Smoke tests

Open the Worker URL followed by `/health`. Expected JSON includes `ok: true` and a `providers` object. To verify full operation, sign in to Pest Platform with a test account, grant that account AI Agent Use permission, test one read request, then test a proposed create/edit action and confirm it only after reviewing the pending action card.
