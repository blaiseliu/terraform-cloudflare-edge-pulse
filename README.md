# Edge-Pulse

Automated AI content pipeline on Cloudflare — ingests multiple RSS feeds, summarizes
articles in Chinese using Workers AI, stores results in D1, and serves a frontend.
Runs on Cloudflare's free tier at $0/month.

## How it works

Every 6 hours, a Cloudflare Worker fetches configured RSS feeds, runs each
new article through Workers AI (Llama 4 Scout 17B), and stores a 2-3 sentence
Chinese summary in D1. Deduplication via SHA-256 URL hashing. A single-page
frontend displays the latest summaries.

```
RSS Feed 1 ─┐
RSS Feed 2 ─┼─→ Worker (fetchAllFeeds) ─→ batchDedup ─→ Workers AI ─→ D1
RSS Feed N ─┘        ▲                                       │
                     │                                Chinese summaries
            Sources stored in D1                              │
            (CRUD via webapp/API)                      GET / HTML frontend
```

## Deploy

**Prerequisites:** Cloudflare account, API token with Workers Scripts:Edit,
D1:Edit, and Workers AI:Edit permissions.

```bash
# 1. Install Worker dependencies
cd worker
npm install

# 2. Run setup (deploys Worker, provisions D1 + Cron)
cd ..
./setup.sh
```

Setup runs `wrangler deploy` first (Worker must exist before the cron trigger),
then `terraform apply` for D1 and cron infrastructure.

Manual alternative (step by step):

```bash
cd worker
npm install
npx wrangler deploy

cd ../terraform
export TF_VAR_cloudflare_account_id="<your-account-id>"
export CLOUDFLARE_API_TOKEN="<your-token>"
terraform init
terraform apply
```

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | HTML frontend — browse articles with Chinese summaries |
| `GET /ingest` | Manually trigger multi-source ingestion. Returns `{processed, skipped, errors}` |
| `GET /articles?limit=N` | JSON list of latest articles (default 20, max 100) |
| `GET /health` | Database stats: `{count, last_ingestion}` |
| `GET /sources` | List all feed sources (D1-backed, managed from webapp) |
| `POST /sources` | Add a feed source (body: `{url, name}`) |
| `PUT /sources/:id` | Update a feed source (partial update) |
| `DELETE /sources/:id` | Delete a feed source |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AI_MODEL` | `@cf/meta/llama-4-scout-17b-16e-instruct` | Workers AI model for summarization |
| `MAX_CONTENT_CHARS` | `2000` | Max content characters sent to AI prompt |

Change these in `worker/wrangler.toml` and re-deploy.

To add or change RSS feeds, use the Feeds panel in the webapp or the `/sources` API — no redeploy needed. Feeds are stored in D1 and take effect on the next ingestion run.

## Project structure

```
terraform/           # D1 + Cron via Terraform
  main.tf
  variables.tf
  outputs.tf
worker/
  src/
    index.ts         # Hono app + HTML frontend (with settings panel)
    ingest.ts        # Multi-source pipeline + D1-backed CRUD for sources
    prompt.ts        # Chinese summarization prompt
  eval/
    eval.ts          # Manual prompt quality evaluation
  wrangler.toml      # Wrangler config (authoritative for Worker deployments)
  vitest.config.ts
setup.sh             # One-command deploy (wrangler + terraform)
```

## Development

```bash
cd worker
npm test            # Run unit tests (vitest, 72 tests)
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

| Resource | Free tier | Usage per batch |
|---|---|---|
| Worker requests | 100,000/day | ~1 per batch + frontend views |
| AI neurons | 10,000/day | ~500 per article |
| D1 storage | 5 GB | ~1 KB per article |
| D1 reads | 5M/day | ~1 per dedup check |
| D1 writes | 100K/day | 1 per new article |

At 3 feeds producing ~45 articles/day, you stay well within the free tier.
Breakeven is ~20 articles/day on the AI neuron budget.

## Roadmap

- **v1.0.0** (shipped) — Multi-source pipeline, HTML frontend, published Terraform module
- **v1.1.0** (now) — D1-backed sources with webapp CRUD (add/remove feeds without redeploying), scoring/tagging
- **v2.0.0** — Hosted SaaS platform with personalized digests

## License

MIT
