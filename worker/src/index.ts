import { Hono } from "hono"
import { ingest, initSchema } from "./ingest"

const app = new Hono<{ Bindings: Env }>()

interface Env {
  DB: D1Database
  AI: Ai
  AI_MODEL: string
  MAX_CONTENT_CHARS: string
}

let schemaInitialized = false

app.get("/ingest", async (c) => {
  try {
    if (!schemaInitialized) {
      await initSchema(c.env.DB)
      schemaInitialized = true
    }

    const maxChars = parseInt(c.env.MAX_CONTENT_CHARS || "2000", 10)
    const result = await ingest(c.env.DB, c.env.AI, c.env.AI_MODEL, maxChars)
    return c.json(result)
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

app.get("/health", async (c) => {
  try {
    if (!schemaInitialized) {
      await initSchema(c.env.DB)
      schemaInitialized = true
    }
    const { results } = await c.env.DB
      .prepare("SELECT COUNT(*) as count, MAX(ingested_at) as last_ingestion FROM articles")
      .all()
    return c.json(results[0] || { count: 0, last_ingestion: null })
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    if (!schemaInitialized) {
      await initSchema(env.DB)
      schemaInitialized = true
    }
    const maxChars = parseInt(env.MAX_CONTENT_CHARS || "2000", 10)
    await ingest(env.DB, env.AI, env.AI_MODEL, maxChars)
  },
}
