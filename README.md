# Edge-Pulse

Automated AI content pipeline on Cloudflare — ingests RSS feeds, summarizes
articles in Chinese using Workers AI, and stores results in D1. Runs on
Cloudflare's free tier at $0/month.

## How it works

Every 6 hours, a Cloudflare Worker fetches the configured RSS feed, runs each
new article through Workers AI (Llama 4 Scout 17B), and stores a 2–3 sentence
Chinese summary in D1. Deduplication via SHA-256 URL hashing.

```
RSS Feed → Worker → Workers AI (LLaMA 4) → D1 Database
                     ↓
              Chinese summaries
```

## Deploy

**Prerequisites:** Cloudflare account, API token with Workers Scripts:Edit,
D1:Edit, and Workers AI:Edit permissions.

```bash
# 1. Install Worker dependencies and build
cd worker
npm install
npm run build

# 2. Deploy the Worker
export CLOUDFLARE_API_TOKEN="<your-token>"
npx wrangler deploy

# 3. Terraform provisions D1 + Cron (infrastructure only)
cd ../terraform
export TF_VAR_cloudflare_account_id="<your-account-id>"
terraform init
terraform apply
```

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /ingest` | Manually trigger ingestion. Returns `{processed, skipped, errors}` |
| `GET /health` | Database stats: `{count, last_ingestion}` |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AI_MODEL` | `@cf/meta/llama-4-scout-17b-16e-instruct` | Workers AI model for summarization |
| `MAX_CONTENT_CHARS` | `2000` | Max content characters sent to AI prompt |

Change these in `worker/wrangler.toml` and re-deploy.

To change the RSS feed, edit `FEED_URL` in `worker/src/ingest.ts`.

## Project structure

```
terraform/           # D1 + Cron via Terraform
  main.tf
  variables.tf
  outputs.tf
worker/
  src/
    index.ts         # Hono app entry point
    ingest.ts        # Pipeline: fetch → summarize → store
    prompt.ts        # Chinese summarization prompt
  eval/
    eval.ts          # Manual prompt quality evaluation
  wrangler.toml      # Wrangler config (authoritative for deployments)
  vitest.config.ts
```

## Development

```bash
cd worker
npm test            # Run unit tests (vitest)
npm run eval        # Manual prompt eval (requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
npm run build       # Build Worker bundle
npm run deploy      # Deploy Worker
```

### Eval script

The eval script fetches live articles and runs them through Workers AI for
manual quality review:

```bash
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
export CLOUDFLARE_API_TOKEN="<your-token>"
npm run eval            # Review 3 articles by default
npm run eval -- --count=5  # Review 5 articles
```

## Free tier math

| Resource | Free tier | Usage per article |
|---|---|---|
| Worker requests | 100,000/day | 1 per batch |
| AI neurons | 10,000/day | ~500 per article |
| D1 storage | 5 GB | ~1 KB per article |
| D1 reads | 5M/day | ~1 per dedup check |
| D1 writes | 100K/day | 1 per new article |

At 15 articles/day (typical for a single feed), you stay well within the free tier.
Breakeven is ~20 articles/day on the AI neuron budget.

## Roadmap

- **v0.1.0** (now) — Single feed, Terraform provisioning, cron trigger
- **v1.0.0** — Published Terraform module (registry.terraform.io), Pages frontend, pluggable sources
- **v2.0.0** — Hosted SaaS platform with personalized digests

## License

MIT
