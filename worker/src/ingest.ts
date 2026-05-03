import { extract } from "@extractus/feed-extractor"

const FEED_URL = "https://simonwillison.net/atom/everything/"
const SCHEMA_SQL = [
  "CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT UNIQUE NOT NULL, source_name TEXT NOT NULL, summary_zh TEXT, published_at TEXT, ingested_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url)",
  "CREATE INDEX IF NOT EXISTS idx_articles_ingested_at ON articles(ingested_at)",
]

export interface Article {
  id: string
  title: string
  url: string
  source: string
  published: string | null
  content: string
}

export interface IngestResult {
  processed: number
  skipped: number
  errors: string[]
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

export async function initSchema(db: D1Database): Promise<void> {
  for (const sql of SCHEMA_SQL) {
    await db.prepare(sql).run()
  }
}

export async function fetchAndParseFeed(): Promise<Article[]> {
  const feed = await extract(FEED_URL, {
    getExtraFeedFields: () => ({}),
    getExtraEntryFields: (entry) => ({
      description: entry.description || entry.summary || "",
    }),
  })

  return (feed.entries || []).map((entry) => {
    const raw = (entry as any).description || entry.summary || ""
    const desc = typeof raw === "string" ? raw : raw?.text || raw?.["#text"] || String(raw)
    return {
      id: "",
      title: entry.title || "Untitled",
      url: entry.link || "",
      source: feed.title || "Unknown",
      published: entry.published || null,
      content: stripHtml(desc),
    }
  }).filter((a) => a.url && a.title !== "Untitled")
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

export async function ingest(
  db: D1Database,
  ai: Ai,
  model: string,
  maxChars: number,
): Promise<IngestResult> {
  const result: IngestResult = { processed: 0, skipped: 0, errors: [] }

  let articles: Article[]
  try {
    articles = await fetchAndParseFeed()
  } catch (err) {
    result.errors.push(`Feed fetch failed: ${String(err)}`)
    return result
  }

  const stmts: D1PreparedStatement[] = []

  for (const article of articles) {
    const id = await sha256(article.url)

    const { results } = await db
      .prepare("SELECT id FROM articles WHERE id = ?")
      .bind(id)
      .all()

    if (results.length > 0) {
      result.skipped++
      continue
    }

    let summary: string | null = null
    try {
      summary = await summarize(ai, model, article.title, article.content, maxChars)
    } catch (err) {
      result.errors.push(`Summarize failed for ${article.url}: ${String(err)}`)
    }

    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO articles (id, title, url, source_name, summary_zh, published_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, article.title, article.url, article.source, summary, article.published),
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
