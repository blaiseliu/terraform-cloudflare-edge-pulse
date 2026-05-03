# Edge-Pulse Usage Guide

Edge-Pulse is deployed at:

```
https://edge-pulse.liujianqing.workers.dev
```

## Browse articles

Open the URL in a browser to see the frontend — a feed of articles with Chinese
summaries, color-coded source chips, and relative timestamps.

## Quick check

```bash
# Is the Worker alive? How many articles?
curl https://edge-pulse.liujianqing.workers.dev/health
# {"count":30,"last_ingestion":"2026-05-03 04:53:37"}

# See recent articles
curl https://edge-pulse.liujianqing.workers.dev/articles?limit=5

# Trigger a manual ingestion run (fetches all 3 sources)
curl https://edge-pulse.liujianqing.workers.dev/ingest
# {"processed":5,"skipped":2,"errors":[]}
```

`/ingest` fetches all configured RSS feeds in parallel, summarizes new articles,
and stores them. Already-ingested articles are skipped (batch dedup via URL lookup).

## Responses

**`GET /`**

HTML frontend with:
- Header showing article count and last ingestion time
- Feed cards with title (linked to original), Chinese summary, source chip, relative date
- Loading skeletons, empty state ("No articles yet"), and error banner with retry
- Auto-refresh button

**`GET /health`**

| Field | Meaning |
|---|---|
| `count` | Total articles in the database |
| `last_ingestion` | Timestamp of the most recent article ingested |

If the table doesn't exist yet (first run), you'll see default values: `{"count":0,"last_ingestion":null}`. Hit `/ingest` to create it.

**`GET /ingest`**

| Field | Meaning |
|---|---|
| `processed` | New articles ingested this run (across all sources) |
| `skipped` | Articles already in the database (batch dedup) |
| `errors` | Per-source fetch failures, AI timeouts, or DB errors |

One broken feed doesn't block the others — errors are collected per-source and the pipeline continues.

**`GET /articles?limit=N`**

| Field | Meaning |
|---|---|
| `title` | Original English title |
| `summary_zh` | 2-3 sentence Chinese summary, or `null` if summarization failed |
| `url` | Source URL (linked from frontend cards) |
| `source_name` | Feed name (e.g. "Simon Willison's Weblog") |
| `feed_url` | Feed URL the article was sourced from |
| `published_at` | Original publication date from the feed |
| `ingested_at` | When Edge-Pulse processed it |

## Cron schedule

Ingestion runs automatically every 6 hours (00:00, 06:00, 12:00, 18:00 UTC).
No manual trigger needed — the pipeline is self-maintaining.

## Verifying it's working

1. Open the frontend in a browser to see article summaries
2. Check health to see article count: `curl <url>/health`
3. Wait 6 hours (or hit `/ingest` manually)
4. Check health again — count should increase if new articles published
5. Reload the frontend to see new cards appear

## Changing feeds

Edit `worker/src/sources.ts`:

```ts
import type { SourceConfig } from "./sources"

export const SOURCES: SourceConfig[] = [
  {
    url: "https://simonwillison.net/atom/everything/",
    name: "Simon Willison's Weblog",
    type: "rss",
  },
  {
    url: "https://hnrss.org/frontpage",
    name: "Hacker News",
    type: "rss",
  },
  // Add or remove feeds here
]
```

Each source must have `url`, `name`, and `type` (currently `"rss"` only; `"hn"` type is planned for v1.1.0). Then rebuild and redeploy:

```bash
cd worker
npm run deploy
```

## Changing the AI model

Edit `worker/wrangler.toml`, the `AI_MODEL` value under `[vars]`:

```toml
[vars]
AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"
```

Available models: `@cf/meta/llama-3.1-8b-instruct`, `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`, and others listed at [developers.cloudflare.com/workers-ai/models](https://developers.cloudflare.com/workers-ai/models/).

Redeploy after changing:

```bash
cd worker
npm run deploy
```

## Running the eval

The eval script fetches live articles, summarizes them, and prints results for manual quality review. Useful when tuning the prompt or switching models.

```bash
cd worker
export CLOUDFLARE_ACCOUNT_ID="344a7f7e7538e7460c83ad633a8bfe57"
export CLOUDFLARE_API_TOKEN="<your-token>"

npm run eval              # 3 articles (default)
npm run eval -- --count=5 # 5 articles
```

Output shows each article's original content, the Chinese summary, and heuristic warnings (no Chinese characters, too short, too long).

## Running tests

```bash
cd worker
npm test
```

49 unit tests covering: SHA-256 hashing, HTML stripping, schema initialization (including Promise gate and migrations), per-source feed fetching, multi-source parallel fetch with failure isolation, batch deduplication, AI summarization, parallel summarizeAll, and the full multi-source ingest pipeline. Endpoint tests cover GET /, /articles, /health, and /ingest with mocked D1 bindings.

## Troubleshooting

**`curl` returns "error code: 1042"**
The Worker isn't reachable at the workers.dev domain. Run `npx wrangler deploy` from the `worker/` directory. This happens when the Worker was deployed via Terraform without `workers_dev` enabled — since v1.0.0, the Worker is deployed via `wrangler deploy` only.

**Health returns "no such table: articles"**
Hit `/ingest` first — the schema is created lazily on the first ingest call (or any endpoint call, via ensureSchema).

**Ingest returns per-source errors like "Feed Name: fetch failed"**
One feed may be unreachable from Cloudflare's network. The error is non-fatal — other feeds still process. Check the feed URL in `worker/src/sources.ts`.

**Ingest returns "Dedup query failed"**
D1 database is unreachable or not properly provisioned. Verify the D1 database exists in the Cloudflare dashboard and the binding is correctly configured in `wrangler.toml`.

**Some articles show "Summary pending" in the frontend**
The AI model may be overloaded or the article content may be empty. These articles are stored with `summary_zh = null`. The error is non-fatal — other articles in the batch still process. The frontend shows italic "Summary pending" for these.

**Need to wipe and restart**
Delete the `articles` table in D1:

```bash
cd worker
npx wrangler d1 execute edge-pulse-db --remote --command "DROP TABLE IF EXISTS articles"
```

Then hit `/ingest` to recreate the schema and re-import everything.
