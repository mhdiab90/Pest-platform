# Pest Platform AI - Cloudflare Workers AI

This folder contains the Cloudflare Worker that will provide the AI assistant endpoint for Pest Platform.

## Architecture

- The browser keeps using Firebase Authentication and Realtime Database.
- The browser builds a limited, question-relevant context from records already available to the signed-in user.
- The browser sends only the prompt/context plus a Firebase ID token to this Worker.
- The Worker verifies the Firebase ID token against Google's published Firebase signing keys.
- The Worker sends the prompt to Cloudflare Workers AI using the `AI` binding.
- The Worker does not read or write the Firebase database and cannot modify Pest Platform records.

## Model and free allowance

Model: `@cf/zai-org/glm-4.7-flash`

Cloudflare currently documents a Workers AI allowance of 10,000 Neurons per day on Workers Free. If the daily free allowance is exceeded, requests fail until the daily reset; moving beyond the free allowance requires a paid Workers plan. Check the official pricing page before production use:

https://developers.cloudflare.com/workers-ai/platform/pricing/

## Create the Worker in the Cloudflare dashboard

1. Sign in at https://dash.cloudflare.com/ (create a Cloudflare account if necessary).
2. Open **Workers & Pages**.
3. Select **Create application** and create a new Worker. Name it `pest-platform-ai`.
4. Deploy the starter Worker once.
5. Open the new Worker and select **Edit Code**.
6. Replace the starter code with the complete contents of `cloudflare/worker.js` in this repository.
7. Save and deploy.
8. Open the Worker **Settings** / **Bindings** section.
9. Add a **Workers AI** binding with the variable name exactly `AI`.
10. Save and deploy again.

Cloudflare's official dashboard guide:
https://developers.cloudflare.com/workers-ai/get-started/dashboard/

Cloudflare's official Workers AI binding guide:
https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/

## Test the deployment

Cloudflare will provide a URL similar to:

`https://pest-platform-ai.<your-workers-subdomain>.workers.dev`

Open:

`https://pest-platform-ai.<your-workers-subdomain>.workers.dev/health`

Expected response:

```json
{"ok":true,"service":"pest-platform-ai","model":"@cf/zai-org/glm-4.7-flash"}
```

Send the **Worker URL only** back to the project maintainer so the Pest Platform frontend can be connected. Do not share Cloudflare passwords, API tokens, or secret keys.

## Security notes

- Only requests originating from `https://mhdiab90.github.io` are accepted.
- The `/ask` route requires a valid Firebase ID token for Firebase project `pest-plat-form`.
- The request body is limited to 30,000 characters.
- The Worker does not receive Firebase database credentials and has no database binding.
- No Cloudflare API token or model secret is embedded in this source file.
- The endpoint is read-only; it only generates answers and never performs database writes.

CORS origin checking is not authentication by itself. The Firebase ID token verification is the authentication control.
