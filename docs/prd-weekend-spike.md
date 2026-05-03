# PRD: Edge-Pulse Weekend Spike (v0.1.0)

**Status:** DRAFT | **Timeline:** This weekend | **Goal:** Prove the Terraform-to-D1 loop works

## What This Is

The smallest possible thing that proves the Edge-Pulse promise: `terraform apply` provisions real Cloudflare infrastructure, a cron-triggered Worker fetches an RSS feed, summarizes articles with Workers AI, and stores them in D1. No frontend, no pluggable sources, no scoring. Just one end-to-end loop on real infrastructure at $0 cost.

If this doesn't work, nothing else matters. If it does, we have a foundation.

## Deliverables

1. **Terraform module** (`main.tf`, `variables.tf`, `outputs.tf`) that provisions:
   - `cloudflare_worker_script` with D1 and AI bindings
   - `cloudflare_d1_database` named `edge-pulse-db`
   - `cloudflare_worker_cron_trigger` with schedule `0 */6 * * *`

2. **TypeScript Worker** (ES modules, `nodejs_compat`, `compatibility_date = "2025-06-01"`) that:
   - Creates `articles` table on cold start (`CREATE TABLE IF NOT EXISTS`)
   - Fetches ONE hardcoded RSS feed (Simon Willison's blog: `https://simonwillison.net/atom/`)
   - Parses RSS to extract title, URL, published date
   - Checks D1 for existing URL (SHA-256 hash as primary key — dedup)
   - Calls Workers AI (Llama 3.1 8B) for Chinese summarization of new articles
   - Inserts new rows into D1
   - Skips articles that fail (AI unavailable, fetch error) — next cron tick retries

3. **Built JS committed** to `worker/dist/index.js`

## D1 Schema

```sql
CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,            -- SHA-256 hash of URL
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    source_name TEXT NOT NULL,
    summary_zh TEXT,
    published_at TEXT,
    ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Acceptance Criteria

- [ ] `terraform apply` succeeds against a real Cloudflare account (`workers.dev` subdomain)
- [ ] Cron fires and Worker executes without errors (check `wrangler tail`)
- [ ] D1 contains rows with Chinese summaries (query via `wrangler d1 execute`)
- [ ] Duplicate URLs are skipped on subsequent cron ticks
- [ ] Cloudflare dashboard shows $0.00 usage after 24 hours
- [ ] `terraform destroy` cleans up all resources

## Prerequisites

- Cloudflare account
- API token with scopes: Workers Scripts (Edit), D1 (Edit), Account Settings (Read)
- Terraform CLI installed locally
- Node.js and Wrangler CLI for Worker development

## What's NOT In Scope

- Pages frontend (query D1 manually via `wrangler d1 execute`)
- Multiple sources / pluggable source variables
- R2 archival
- Scoring, tagging, sentiment
- API endpoint
- Terraform Registry publication
- CI/CD pipeline

## Next Phase

Once this works, proceed to **v1.0.0** (`docs/prd-v1-terraform-module.md`) — Pages frontend, pluggable sources, full pipeline.
