import { Hono } from "hono"
import { ingest, ensureSchema } from "./ingest"

const app = new Hono<{ Bindings: Env }>()

interface Env {
  DB: D1Database
  AI: Ai
  AI_MODEL: string
  MAX_CONTENT_CHARS: string
}

app.get("/ingest", async (c) => {
  try {
    await ensureSchema(c.env.DB)
    const maxChars = parseInt(c.env.MAX_CONTENT_CHARS || "2000", 10)
    const result = await ingest(c.env.DB, c.env.AI, c.env.AI_MODEL, maxChars)
    return c.json(result)
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

app.get("/articles", async (c) => {
  try {
    await ensureSchema(c.env.DB)
    const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100)
    const { results } = await c.env.DB
      .prepare(
        "SELECT title, summary_zh, url, source_name, feed_url, published_at, ingested_at FROM articles ORDER BY ingested_at DESC LIMIT ?",
      )
      .bind(limit)
      .all()
    return c.json(results)
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

app.get("/health", async (c) => {
  try {
    await ensureSchema(c.env.DB)
    const { results } = await c.env.DB
      .prepare("SELECT COUNT(*) as count, MAX(ingested_at) as last_ingestion FROM articles")
      .all()
    return c.json(results[0] || { count: 0, last_ingestion: null })
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

app.get("/", async (c) => {
  return c.html(FRONTEND_HTML)
})

const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Edge-Pulse</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #f5f5f5;
    color: #1a1a1a;
    line-height: 1.6;
    min-height: 100vh;
  }
  .container { max-width: 720px; margin: 0 auto; padding: 24px 16px; }

  header {
    padding: 32px 0 24px;
    border-bottom: 2px solid #e0e0e0;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
  }
  header h1 { font-size: 24px; font-weight: 700; color: #111; }
  header .meta { font-size: 13px; color: #666; }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .toolbar button {
    background: #1a1a1a;
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }
  .toolbar button:hover { background: #333; }
  .toolbar button:disabled { opacity: 0.5; cursor: default; }

  .card {
    background: #fff;
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 12px;
    border: 1px solid #e8e8e8;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: #ccc; }
  .card h2 { font-size: 17px; margin-bottom: 8px; line-height: 1.4; }
  .card h2 a { color: #1a1a1a; text-decoration: none; }
  .card h2 a:hover { text-decoration: underline; }
  .card .summary { font-size: 15px; color: #333; margin-bottom: 10px; }
  .card .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #888;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
  }
  .chip-simon     { background: #e17055; }
  .chip-hacker    { background: #ff6600; }
  .chip-mit       { background: #c41e3a; }
  .chip-default   { background: #636e72; }

  .skeleton { background: #fff; border-radius: 10px; padding: 20px; margin-bottom: 12px; border: 1px solid #e8e8e8; }
  .skeleton .line {
    height: 14px;
    background: #e8e8e8;
    border-radius: 4px;
    margin-bottom: 10px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  .skeleton .line:last-child { margin-bottom: 0; }
  .skeleton .line.title { width: 60%; height: 18px; }
  .skeleton .line.body  { width: 100%; }
  .skeleton .line.meta  { width: 35%; height: 12px; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .empty-state {
    text-align: center;
    padding: 64px 16px;
    color: #888;
  }
  .empty-state p { font-size: 16px; margin-bottom: 16px; }
  .empty-state a { color: #555; font-size: 14px; }

  .error-banner {
    background: #fff0f0;
    border: 1px solid #ffcccc;
    color: #c00;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .error-banner button {
    background: none;
    border: none;
    color: #c00;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 4px;
  }

  footer {
    text-align: center;
    padding: 32px 0;
    font-size: 12px;
    color: #aaa;
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Edge-Pulse</h1>
    <span class="meta" id="header-meta"></span>
  </header>

  <div class="toolbar">
    <span id="article-count" style="font-size:13px;color:#888;"></span>
    <button id="refresh-btn" onclick="loadArticles()">Refresh</button>
  </div>

  <div id="error-banner" class="error-banner" style="display:none;">
    <span id="error-msg"></span>
    <button onclick="dismissError()">×</button>
  </div>

  <div id="content"></div>

  <footer>Edge-Pulse · Cloudflare Workers + D1 + Workers AI</footer>
</div>

<script>
function sourceChip(name) {
  const map = {
    "Simon Willison's Weblog": "simon",
    "Hacker News": "hacker",
    "MIT Technology Review": "mit",
  }
  const cls = map[name] || "default"
  return '<span class="chip chip-' + cls + '">' + h(name) + '</span>'
}

function timeAgo(dateStr) {
  if (!dateStr) return ""
  var diff = Date.now() - new Date(dateStr + "Z").getTime()
  var mins = Math.floor(diff / 60000)
  var hrs  = Math.floor(diff / 3600000)
  var days = Math.floor(diff / 86400000)
  if (mins < 1)  return "just now"
  if (mins < 60) return mins + "m ago"
  if (hrs  < 24) return hrs  + "h ago"
  return days + "d ago"
}

function h(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function renderSkeletons() {
  var html = ""
  for (var i = 0; i < 3; i++) {
    html += '<div class="skeleton"><div class="line title"></div><div class="line body"></div><div class="line meta"></div></div>'
  }
  return html
}

function renderCards(articles) {
  if (articles.length === 0) {
    return '<div class="empty-state"><p>No articles yet.</p><p style="font-size:14px;">Check back after the next ingestion run, or <a href="/ingest">trigger one now</a>.</p></div>'
  }
  return articles.map(function(a) {
    return '<div class="card">' +
      '<h2><a href="' + h(a.url) + '" target="_blank" rel="noopener">' + h(a.title) + '</a></h2>' +
      (a.summary_zh ? '<div class="summary">' + h(a.summary_zh) + '</div>' : '<div class="summary" style="color:#aaa;font-style:italic;">Summary pending</div>') +
      '<div class="meta-row">' +
        '<span>' + sourceChip(a.source_name) + ' · ' + timeAgo(a.published_at || a.ingested_at) + '</span>' +
      '</div>' +
    '</div>'
  }).join("")
}

function showError(msg) {
  document.getElementById("error-msg").textContent = msg
  document.getElementById("error-banner").style.display = "flex"
}

function dismissError() {
  document.getElementById("error-banner").style.display = "none"
}

function updateHeader(health) {
  var el = document.getElementById("header-meta")
  if (health && health.last_ingestion) {
    el.textContent = health.count + " articles · last ingestion " + timeAgo(health.last_ingestion)
  } else if (health && health.count) {
    el.textContent = health.count + " articles"
  }
}

async function loadArticles() {
  var content = document.getElementById("content")
  var btn = document.getElementById("refresh-btn")
  var countEl = document.getElementById("article-count")
  content.innerHTML = renderSkeletons()
  btn.disabled = true
  dismissError()

  try {
    var healthResp = await fetch("/health")
    var health = await healthResp.json()
    if (!health.error) updateHeader(health)

    var resp = await fetch("/articles?limit=50")
    if (!resp.ok) throw new Error("HTTP " + resp.status)
    var articles = await resp.json()
    if (articles.error) throw new Error(articles.error)

    countEl.textContent = articles.length + " articles shown"
    content.innerHTML = renderCards(articles)
  } catch (err) {
    content.innerHTML = renderCards([])
    showError("Something went wrong: " + err.message)
  } finally {
    btn.disabled = false
  }
}

loadArticles()
</script>
</body>
</html>`

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await ensureSchema(env.DB)
    const maxChars = parseInt(env.MAX_CONTENT_CHARS || "2000", 10)
    await ingest(env.DB, env.AI, env.AI_MODEL, maxChars)
  },
}
