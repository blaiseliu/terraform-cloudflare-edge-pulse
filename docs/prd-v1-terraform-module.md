# PRD: Edge-Pulse v1.0.0 — Terraform Registry Module

**Status:** DRAFT | **Timeline:** After weekend spike succeeds | **Goal:** Published Terraform module with full pipeline

## What This Is

A versioned, published Terraform module (`edge-pulse/pipeline/cloudflare`) on registry.terraform.io. Another developer imports it into their own Terraform with 3 lines of HCL, runs `terraform apply`, and gets a complete AI content pipeline: ingestion Worker, D1 database, Pages frontend, Cron trigger — all on Cloudflare free tier, $0/month.

The headline: **"$0/month, one command, your own AI digest."**

## What Changed Since the Spike

| Spike (v0.1.0) | v1.0.0 |
|---|---|
| One hardcoded RSS source | Pluggable sources via Terraform `list(object{...})` variable |
| No frontend | Pages site with static HTML + `/api/articles` Function |
| Manual D1 queries | Pages frontend renders chronological feed |
| `workers.dev` subdomain | `workers.dev` (custom domain optional) |
| No Registry | Published on registry.terraform.io |
| Ad-hoc Worker | Committed `worker/dist/index.js` with CI build verification |

## Deliverables

### 1. Terraform Module (`published on registry.terraform.io`)

```
module "edge_pulse" {
  source  = "edge-pulse/pipeline/cloudflare"
  version = "1.0.0"

  sources = [
    { name = "Hacker News", type = "hackernews", max_items = 10 },
    { name = "Simon Willison", type = "rss", url = "https://simonwillison.net/atom/", max_items = 5 },
  ]
  language = "zh-CN"
}
```

Resources provisioned:
- `cloudflare_worker_script` — ingestion Worker with D1 + AI bindings
- `cloudflare_d1_database` — `edge-pulse-db`
- `cloudflare_worker_cron_trigger` — schedule `0 */6 * * *`
- `cloudflare_pages_project` — empty project (assets deployed via `wrangler pages deploy`)

### 2. Ingestion Worker

Same architecture as the spike, but sources come from the Terraform variable (passed via Worker secret/environment binding).

- Parallel RSS fetch via `Promise.all`
- Dedup by URL hash (SHA-256 → `id` column)
- Parallel Workers AI summarization via `Promise.all`
- Atomic D1 insert per article
- Failure modes: skip failed feeds, log via `console.error`, retry on next cron tick

### 3. Pages Frontend

Directory structure:
```
pages/
  index.html                    # Static frontend — chronological feed
  functions/
    api/
      articles.ts               # GET /api/articles?limit=50 → queries D1
```

- Static HTML + vanilla JS, responsive
- Fetches `/api/articles?limit=50` from Pages Function
- Renders: title, Chinese summary, source name, date
- Pages Function has D1 binding (`env.DB`)

### 4. CI/CD

GitHub Actions:
1. `npm run build` in `worker/`
2. Verify committed `worker/dist/index.js` matches build output (fail PR if stale)
3. `terraform validate`
4. `terraform fmt --check`

### 5. Documentation

README.md with:
- One-command deploy instructions
- Prerequisites (Cloudflare account, API token scopes)
- Source configuration examples
- Free-tier ceiling documentation (~20 articles/day breakeven)
- Terraform state backend options
- `terraform destroy` teardown

## D1 Schema (unchanged from spike)

```sql
CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    source_name TEXT NOT NULL,
    summary_zh TEXT,
    published_at TEXT,
    ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Free-Tier Budget

| Resource | Limit | v1.0.0 Usage (3 sources, ~15 articles/day) |
|---|---|---|
| Workers requests | 100k/day | ~4-8 |
| Workers AI neurons | 10k/day | ~6,000-9,750 |
| D1 storage | 5 GB | <10 MB |
| D1 rows read | 5M/month | ~450 |
| D1 rows written | 100k/month | ~450 |
| Pages static requests | Unlimited | — |
| Pages Functions | 100k/day | ~100 |
| **Total cost** | | **$0.00** |

## Acceptance Criteria

- [ ] `terraform apply` succeeds against a fresh Cloudflare account
- [ ] Developer can change sources via `terraform.tfvars` without touching Worker code
- [ ] Cron fires, Worker ingests, Pages site displays articles with Chinese summaries
- [ ] Pipeline runs unattended for 7 days without intervention
- [ ] Pages frontend loads in <2 seconds (PageSpeed >90)
- [ ] Total Cloudflare bill: $0.00
- [ ] One other engineer successfully deploys from the README

## What's NOT in v1.0.0

- Scoring, tagging, sentiment (→ v1.1.0)
- R2 archival of raw payloads (→ v1.2.0)
- API endpoint for external consumers (→ v1.2.0)
- Multi-language support beyond `zh-CN` (→ v1.1.0)
- Cloudflare Queues for fan-out at scale (→ v1.2.0)

## Next Phase

After v1.0.0 ships and has users, proceed to **v2.0.0** (`docs/prd-v2-hosted-platform.md`) — hosted SaaS with paid tiers.
