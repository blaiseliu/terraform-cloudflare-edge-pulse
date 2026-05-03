import { extract } from "@extractus/feed-extractor"

const SCHEMA_SQL = [
  "CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT UNIQUE NOT NULL, source_name TEXT NOT NULL, feed_url TEXT, summary_zh TEXT, published_at TEXT, ingested_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url)",
  "CREATE INDEX IF NOT EXISTS idx_articles_ingested_at ON articles(ingested_at)",
  "CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, url TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'rss', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
]

const MIGRATION_SQL = [
  "ALTER TABLE articles ADD COLUMN feed_url TEXT",
  "CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url)",
]

const DEFAULT_SOURCES = [
  { url: "https://simonwillison.net/atom/everything/", name: "Simon Willison's Weblog", type: "rss" },
  { url: "https://hnrss.org/frontpage", name: "Hacker News", type: "rss" },
  { url: "https://www.technologyreview.com/feed/", name: "MIT Technology Review", type: "rss" },
]

export interface Article {
  id: string
  title: string
  url: string
  source: string
  feedUrl: string
  published: string | null
  content: string
}

export interface IngestResult {
  processed: number
  skipped: number
  errors: string[]
}

export interface SourceRow {
  id: string
  url: string
  name: string
  type: string
  enabled: number
  created_at: string
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function stripHtml(html: unknown): string {
  if (typeof html !== "string") return ""
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
}

let schemaReady: Promise<void> | null = null

export async function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const sql of SCHEMA_SQL) {
        await db.prepare(sql).run()
      }
      for (const sql of MIGRATION_SQL) {
        try { await db.prepare(sql).run() } catch { /* column exists */ }
      }
      await seedDefaultSources(db)
    })()
  }
  return schemaReady
}

async function seedDefaultSources(db: D1Database): Promise<void> {
  const { results } = await db.prepare("SELECT COUNT(*) as count FROM sources").all()
  if ((results[0] as any).count > 0) return

  const stmts = DEFAULT_SOURCES.map((s) =>
    db.prepare("INSERT OR IGNORE INTO sources (id, url, name, type) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), s.url, s.name, s.type),
  )
  await db.batch(stmts)
}

// ---------------------------------------------------------------------------
// Sources CRUD
// ---------------------------------------------------------------------------
export async function getSources(db: D1Database): Promise<SourceRow[]> {
  const { results } = await db.prepare("SELECT id, url, name, type, enabled, created_at FROM sources ORDER BY created_at ASC").all()
  return results as unknown as SourceRow[]
}

export async function addSource(db: D1Database, input: { url: string; name: string; type?: string }): Promise<SourceRow> {
  const id = crypto.randomUUID()
  await db.prepare("INSERT INTO sources (id, url, name, type) VALUES (?, ?, ?, ?)")
    .bind(id, input.url, input.name, input.type || "rss")
    .run()
  return { id, url: input.url, name: input.name, type: input.type || "rss", enabled: 1, created_at: new Date().toISOString() }
}

export async function updateSource(db: D1Database, id: string, updates: { url?: string; name?: string; type?: string; enabled?: number }): Promise<boolean> {
  const sets: string[] = []
  const vals: any[] = []

  if (updates.url !== undefined) { sets.push("url = ?"); vals.push(updates.url) }
  if (updates.name !== undefined) { sets.push("name = ?"); vals.push(updates.name) }
  if (updates.type !== undefined) { sets.push("type = ?"); vals.push(updates.type) }
  if (updates.enabled !== undefined) { sets.push("enabled = ?"); vals.push(updates.enabled) }

  if (sets.length === 0) return false

  vals.push(id)
  const result = await db.prepare(`UPDATE sources SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run()
  return (result.meta as any).changes > 0
}

export async function deleteSource(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM sources WHERE id = ?").bind(id).run()
  return (result.meta as any).changes > 0
}

// ---------------------------------------------------------------------------
// Feed fetching
// ---------------------------------------------------------------------------
interface SourceConfig {
  url: string
  name: string
  type: string
}

async function fetchFeed(source: SourceConfig): Promise<Article[]> {
  const feed = await extract(source.url, {
    getExtraFeedFields: () => ({}),
    getExtraEntryFields: (entry) => ({
      description: entry.description || entry.summary || "",
    }),
  })

  return (feed.entries || [])
    .map((entry) => {
      const raw = (entry as any).description || entry.summary || ""
      const desc = typeof raw === "string" ? raw : raw?.text || raw?.["#text"] || String(raw)
      return {
        id: "",
        title: entry.title || "Untitled",
        url: entry.link || "",
        source: source.name,
        feedUrl: source.url,
        published: entry.published || null,
        content: stripHtml(desc),
      }
    })
    .filter((a) => a.url && a.title !== "Untitled")
}

export async function fetchAllFeeds(
  sources: SourceConfig[],
): Promise<{ articles: Article[]; errors: string[] }> {
  const errors: string[] = []

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return await fetchFeed(source)
      } catch (err) {
        errors.push(`${source.name}: ${String(err)}`)
        return []
      }
    }),
  )

  return { articles: results.flat(), errors }
}

export async function batchDedup(db: D1Database, articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return []

  const urls = articles.map((a) => a.url)
  const placeholders = urls.map(() => "?").join(", ")
  const { results } = await db
    .prepare(`SELECT url FROM articles WHERE url IN (${placeholders})`)
    .bind(...urls)
    .all()

  const existingUrls = new Set((results as { url: string }[]).map((r) => r.url))
  return articles.filter((a) => !existingUrls.has(a.url))
}

export async function summarize(
  ai: Ai,
  model: string,
  title: string,
  content: string,
  maxChars: number,
): Promise<string | null> {
  const { SYSTEM_PROMPT, buildUserPrompt } = await import("./prompt")
  const truncated = content.slice(0, maxChars)

  try {
    const result = await ai.run(model as any, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(title, truncated) },
      ],
    })
    return (result as any).response || null
  } catch {
    return null
  }
}

export async function summarizeAll(
  ai: Ai,
  model: string,
  articles: Article[],
  maxChars: number,
): Promise<(Article & { summary: string | null })[]> {
  const results = await Promise.all(
    articles.map(async (article) => {
      const summary = await summarize(ai, model, article.title, article.content, maxChars)
      return { ...article, summary }
    }),
  )
  return results
}

export async function ingest(
  db: D1Database,
  ai: Ai,
  model: string,
  maxChars: number,
): Promise<IngestResult> {
  const result: IngestResult = { processed: 0, skipped: 0, errors: [] }

  const dbSources = await getSources(db)
  const enabled = dbSources.filter((s) => s.enabled === 1)
  if (enabled.length === 0) {
    result.errors.push("No enabled sources configured")
    return result
  }

  const { articles: fetched, errors: fetchErrors } = await fetchAllFeeds(enabled)
  result.errors.push(...fetchErrors)

  if (fetched.length === 0) {
    if (result.errors.length === 0) {
      result.errors.push("No articles fetched from any source")
    }
    return result
  }

  let newArticles: Article[]
  try {
    newArticles = await batchDedup(db, fetched)
    result.skipped = fetched.length - newArticles.length
  } catch (err) {
    result.errors.push(`Dedup query failed: ${String(err)}`)
    return result
  }

  if (newArticles.length === 0) return result

  const summarized = await summarizeAll(ai, model, newArticles, maxChars)

  const stmts: D1PreparedStatement[] = []
  for (const article of summarized) {
    const id = await sha256(article.url)
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO articles (id, title, url, source_name, feed_url, summary_zh, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, article.title, article.url, article.source, article.feedUrl, article.summary, article.published),
    )
    result.processed++
  }

  if (stmts.length > 0) {
    try {
      await db.batch(stmts)
    } catch (err) {
      result.errors.push(`D1 batch insert failed: ${String(err)}`)
    }
  }

  return result
}
