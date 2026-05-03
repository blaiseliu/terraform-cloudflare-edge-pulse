# Edge-Pulse Usage Guide

Edge-Pulse is deployed at:

```
https://edge-pulse.liujianqing.workers.dev
```

## Quick check

```bash
# Is the Worker alive? How many articles?
curl https://edge-pulse.liujianqing.workers.dev/health
# {"count":30,"last_ingestion":"2026-05-03 04:53:37"}

# Trigger a manual ingestion run
curl https://edge-pulse.liujianqing.workers.dev/ingest
# {"processed":3,"skipped":0,"errors":[]}
```

`/ingest` fetches the RSS feed, summarizes new articles, and stores them. Already-ingested articles are skipped (dedup via URL hash).

## Responses

**`GET /health`**

| Field | Meaning |
|---|---|
| `count` | Total articles in the database |
| `last_ingestion` | Timestamp of the most recent article ingested |

If the table doesn't exist yet (first run), you'll see: `{"error":"..."}`. Hit `/ingest` to create it.

**`GET /ingest`**

| Field | Meaning |
|---|---|
| `processed` | New articles ingested this run |
| `skipped` | Articles already in the database (dedup) |
| `errors` | Anything that failed (feed down, AI timeout, etc.) |

## What the data looks like

Each row in D1:

| Column | Content |
|---|---|
| `id` | SHA-256 hash of the article URL (primary key) |
| `title` | Original English title |
| `url` | Source URL |
| `source_name` | Feed name (e.g. "Simon Willison's Weblog") |
| `summary_zh` | 2-3 sentence Chinese summary, or `null` if summarization failed |
| `published_at` | Original publication date from the feed |
| `ingested_at` | When Edge-Pulse processed it |

## Cron schedule

Ingestion runs automatically every 6 hours (00:00, 06:00, 12:00, 18:00 UTC).
No manual trigger needed — the pipeline is self-maintaining.

## Verifying it's working

1. Check health to see article count: `curl <url>/health`
2. Wait 6 hours (or hit `/ingest` manually)
3. Check health again — count should increase if new articles published

## Changing the RSS feed

Edit `worker/src/ingest.ts`, line 3:

```ts
const FEED_URL = "https://simonwillison.net/atom/everything/"
```

Change it to any Atom, RSS, or JSON Feed URL. Then rebuild and redeploy:

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

21 unit tests covering: SHA-256 hashing, HTML stripping, schema initialization, feed parsing, AI summarization, and the full ingest pipeline with mocked dependencies.

## Troubleshooting

**`curl` returns "error code: 1042"**
The Worker isn't reachable at the workers.dev domain. Run `npx wrangler deploy` from the `worker/` directory. This happens when the Worker was deployed via Terraform without `workers_dev` enabled.

**Health returns "no such table: articles"**
Hit `/ingest` first — the schema is created lazily on the first ingest call.

**Ingest returns "Feed fetch failed"**
The RSS feed URL may be unreachable from Cloudflare's network, or the feed URL has changed. Verify the URL works from a browser. Check `FEED_URL` in `worker/src/ingest.ts`.

**Ingest returns "Summarize failed" for some articles**
The AI model may be overloaded or the article content may be empty. These articles are stored with `summary_zh = null`. The error is non-fatal — other articles in the batch still process.

**Need to wipe and restart**
Delete the `articles` table in D1:

```bash
cd worker
npx wrangler d1 execute edge-pulse-db --remote --command "DROP TABLE IF EXISTS articles"
```

Then hit `/ingest` to recreate the schema and re-import everything.
