# Deploy Your Own Edge-Pulse Instance

Deploy a personal AI content pipeline on Cloudflare's free tier — ingests RSS feeds,
summarizes articles in Chinese, and serves a frontend. ~10 minutes, $0/month.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) 22+ and npm
- [Terraform](https://developer.hashicorp.com/terraform/downloads) 1.9+

## Step 1 — Create a Cloudflare API token

Go to the [API Tokens page](https://dash.cloudflare.com/profile/api-tokens) and
create a token with these permissions:

| Permission | Scope |
|---|---|
| Workers Scripts — Edit | Account |
| D1 — Edit | Account |
| Workers AI — Edit | Account |

Save the token. You'll need it in the next steps.

Find your **Account ID** at the top of the [Workers & Pages](https://dash.cloudflare.com/workers) dashboard.

## Step 2 — Clone and install

```bash
git clone https://github.com/blaiseliu/terraform-cloudflare-edge-pulse.git
cd terraform-cloudflare-edge-pulse/worker
npm install
```

## Step 3 — Configure

Edit `worker/wrangler.toml` — set your account ID:

```toml
account_id = "your-account-id-here"
```

Optionally change the AI model:

```toml
[vars]
AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"
MAX_CONTENT_CHARS = "2000"
```

Feed sources are managed from the webapp or API after deployment — no config file edits needed. Three default feeds (Simon Willison, Hacker News, MIT Technology Review) are seeded automatically on first run.

## Step 4 — Deploy the Worker

```bash
cd worker
export CLOUDFLARE_API_TOKEN="your-api-token"
npx wrangler deploy
```

After deployment, wrangler prints your workers.dev URL:

```
https://edge-pulse.<your-subdomain>.workers.dev
```

## Step 5 — Provision D1 and Cron

```bash
cd ../terraform
export CLOUDFLARE_API_TOKEN="your-api-token"
export TF_VAR_cloudflare_account_id="your-account-id"

terraform init
terraform apply
```

Review the plan and type `yes`. Terraform creates:
- A D1 database (`edge-pulse-db`)
- A cron trigger (runs ingestion every 6 hours)

## Step 6 — Trigger the first ingestion

Hit the ingest endpoint to initialize the schema and pull articles:

```bash
curl https://edge-pulse.<your-subdomain>.workers.dev/ingest
```

Response:

```json
{"processed": 15, "skipped": 0, "errors": []}
```

## Step 7 — Verify

```bash
# Check article count
curl https://edge-pulse.<your-subdomain>.workers.dev/health
# {"count":15,"last_ingestion":"2026-05-03 18:13:35"}

# Browse the frontend
open https://edge-pulse.<your-subdomain>.workers.dev
```

The frontend shows feed cards with Chinese summaries, source chips, and timestamps.

## Changing feeds later

Feeds are stored in D1 and managed from the webapp or API — no redeploy needed.

**From the webapp**: Click **Feeds** → toggle, delete, or add feeds using the settings panel.

**From the API**:

```bash
# List sources
curl https://edge-pulse.<your-subdomain>.workers.dev/sources

# Add a source
curl -X POST https://edge-pulse.<your-subdomain>.workers.dev/sources \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/feed","name":"My Feed"}'

# Toggle enabled/disabled
curl -X PUT https://edge-pulse.<your-subdomain>.workers.dev/sources/<id> \
  -H "Content-Type: application/json" \
  -d '{"enabled":0}'

# Delete a source
curl -X DELETE https://edge-pulse.<your-subdomain>.workers.dev/sources/<id>
```

No terraform or wrangler changes needed — sources are stored in D1 and take effect on the next ingestion run.

## Changing the AI model

Edit `worker/wrangler.toml` under `[vars]`, then redeploy:

```bash
cd worker
npx wrangler deploy
```

Available models: [Cloudflare Workers AI models](https://developers.cloudflare.com/workers-ai/models/).

## Troubleshooting

**`curl` returns error 1042**
The Worker isn't reachable. Run `npx wrangler deploy` from the `worker/` directory.

**Health returns `error`**
The D1 schema hasn't been created yet. Hit `/ingest` once — the schema is initialized on first access.

**Ingest returns per-source errors like `Feed Name: fetch failed`**
One RSS feed may be unreachable. The error is non-fatal — other feeds still process. Check the feed URL.

**No Chinese characters in summaries**
The AI model may be overloaded. Try switching to a different model in `wrangler.toml`, or check the Workers AI dashboard for rate limiting.

**Need to wipe and restart**
```bash
cd worker
npx wrangler d1 execute edge-pulse-db --remote --command "DROP TABLE IF EXISTS articles"
```
Then hit `/ingest` to recreate.

## Free tier limits

At 3 feeds producing ~45 articles/day, you use well under 10% of Cloudflare's free tier.
The limiting factor is the Workers AI neuron budget (~20 articles/day per model).
If you hit limits, reduce the number of feeds or increase the cron interval.

| Resource | Free tier | Your usage |
|---|---|---|
| Worker requests | 100,000/day | ~150/day |
| AI neurons | 10,000/day | ~2,500/day |
| D1 storage | 5 GB | ~100 KB |
| D1 reads | 5M/day | ~100/day |
| D1 writes | 100K/day | ~45/day |
