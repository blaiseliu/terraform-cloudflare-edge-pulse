import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------
describe("GET /", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns 200 with HTML content type", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/")
    const res = await worker.fetch(req)

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
  })

  it("HTML contains the Edge-Pulse title", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/")
    const res = await worker.fetch(req)
    const html = await res.text()

    expect(html).toContain("<title>Edge-Pulse</title>")
    expect(html).toContain("<h1>Edge-Pulse</h1>")
    expect(html).toContain("loadArticles()")
  })
})

// ---------------------------------------------------------------------------
// GET /articles
// ---------------------------------------------------------------------------
describe("GET /articles", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns JSON array of articles", async () => {
    const articles = [
      {
        title: "Test Article",
        summary_zh: "中文摘要",
        url: "https://example.com/1",
        source_name: "Test Feed",
        feed_url: "https://example.com/feed",
        published_at: "2026-05-01",
        ingested_at: "2026-05-01T12:00:00",
      },
    ]

    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/articles")
    const res = await worker.fetch(req, { DB: mockDb(articles), AI: mockAi, AI_MODEL: "model", MAX_CONTENT_CHARS: "2000" })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].title).toBe("Test Article")
    expect(body[0].summary_zh).toBe("中文摘要")
    expect(body[0].source_name).toBe("Test Feed")
  })

  it("respects limit query parameter", async () => {
    let boundLimit = 0
    const articles: any[] = []

    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/articles?limit=5")
    const res = await worker.fetch(req, {
      DB: mockDbWithSpy(articles, (limit) => { boundLimit = limit }),
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(200)
    expect(boundLimit).toBe(5)
  })

  it("clamps limit to 100 max", async () => {
    let boundLimit = 0
    const articles: any[] = []

    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/articles?limit=500")
    const res = await worker.fetch(req, {
      DB: mockDbWithSpy(articles, (limit) => { boundLimit = limit }),
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(200)
    expect(boundLimit).toBe(100)
  })

  it("defaults to limit 20 when not specified", async () => {
    let boundLimit = 0
    const articles: any[] = []

    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/articles")
    const res = await worker.fetch(req, {
      DB: mockDbWithSpy(articles, (limit) => { boundLimit = limit }),
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(200)
    expect(boundLimit).toBe(20)
  })

  it("returns 500 on DB error", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/articles")
    const res = await worker.fetch(req, {
      DB: mockFailingDb(),
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })
})

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe("GET /health", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns count and last_ingestion", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/health")
    const res = await worker.fetch(req, {
      DB: mockDb([], [{ count: 42, last_ingestion: "2026-05-03 12:00:00" }]),
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(42)
    expect(body.last_ingestion).toBe("2026-05-03 12:00:00")
  })

  it("returns default values for empty database", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/health")
    const res = await worker.fetch(req, {
      DB: mockDb([], []), // Empty results from SELECT
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(0)
    expect(body.last_ingestion).toBeNull()
  })

  it("returns 500 on DB error", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 0, skipped: 0, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/health")
    const res = await worker.fetch(req, {
      DB: mockFailingDb(),
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })
})

// ---------------------------------------------------------------------------
// GET /ingest
// ---------------------------------------------------------------------------
describe("GET /ingest", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("triggers pipeline and returns result", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => ({ processed: 3, skipped: 1, errors: [] }),
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/ingest")
    const res = await worker.fetch(req, {
      DB: mockDb(),
      AI: mockAi,
      AI_MODEL: "test-model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(3)
    expect(body.skipped).toBe(1)
    expect(body.errors).toHaveLength(0)
  })

  it("returns 500 on pipeline error", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      ingest: async () => {
        throw new Error("Pipeline crashed")
      },
      getSources: async () => [],
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/ingest")
    const res = await worker.fetch(req, {
      DB: mockDb(),
      AI: mockAi,
      AI_MODEL: "model",
      MAX_CONTENT_CHARS: "2000",
    })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain("Pipeline crashed")
  })
})

// ---------------------------------------------------------------------------
// GET /sources
// ---------------------------------------------------------------------------
describe("GET /sources", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns JSON array of sources", async () => {
    const sources = [
      { id: "s1", url: "https://a.com/feed", name: "Feed A", type: "rss", enabled: 1, created_at: "2026-01-01" },
      { id: "s2", url: "https://b.com/feed", name: "Feed B", type: "rss", enabled: 0, created_at: "2026-01-02" },
    ]

    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      getSources: async () => sources,
      addSource: async () => ({}),
      updateSource: async () => true,
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources")
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].name).toBe("Feed A")
    expect(body[1].enabled).toBe(0)
  })

  it("returns 500 on DB error", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      getSources: async () => { throw new Error("DB down") },
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources")
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })
})

// ---------------------------------------------------------------------------
// POST /sources
// ---------------------------------------------------------------------------
describe("POST /sources", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("creates a source and returns 201", async () => {
    const created = {
      id: "new-id",
      url: "https://new.com/feed",
      name: "New Feed",
      type: "rss",
      enabled: 1,
      created_at: "2026-05-03",
    }

    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      addSource: async () => created,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://new.com/feed", name: "New Feed" }),
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe("new-id")
    expect(body.name).toBe("New Feed")
  })

  it("returns 400 when url is missing", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      addSource: async () => ({}),
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No URL" }),
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("url")
  })

  it("returns 400 when name is missing", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      addSource: async () => ({}),
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://x.com/feed" }),
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("name")
  })

  it("returns 500 on DB error", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      addSource: async () => { throw new Error("DB write failed") },
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://x.com/feed", name: "X" }),
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })
})

// ---------------------------------------------------------------------------
// PUT /sources/:id
// ---------------------------------------------------------------------------
describe("PUT /sources/:id", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("updates a source and returns ok", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      updateSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources/s1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: 0 }),
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it("returns 404 when source not found", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      updateSource: async () => false,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources/nonexistent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: 0 }),
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(404)
  })

  it("returns 500 on DB error", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      updateSource: async () => { throw new Error("DB write failed") },
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources/s1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: 0 }),
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// DELETE /sources/:id
// ---------------------------------------------------------------------------
describe("DELETE /sources/:id", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("deletes a source and returns ok", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      deleteSource: async () => true,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources/s1", {
      method: "DELETE",
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it("returns 404 when source not found", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      deleteSource: async () => false,
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources/nonexistent", {
      method: "DELETE",
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(404)
  })

  it("returns 500 on DB error", async () => {
    vi.doMock("./ingest", () => ({
      ensureSchema: async () => {},
      deleteSource: async () => { throw new Error("DB write failed") },
    }))

    const { default: worker } = await import("./index")
    const req = new Request("https://edge-pulse.workers.dev/sources/s1", {
      method: "DELETE",
    })
    const res = await worker.fetch(req, { DB: mockDb() })

    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAi = {
  run: async () => ({ response: "summary" }),
} as unknown as Ai

function makeD1Stmt(sql: string, results: any[] = []) {
  let boundArgs: any[] = []
  const stmt = {
    bind: (...args: any[]) => {
      boundArgs = args
      return stmt
    },
    all: async () => {
      if (sql.includes("COUNT(*)") || sql.includes("MAX(")) {
        return { results }
      }
      return { results }
    },
    run: async () => ({}),
    _args: boundArgs,
    _sql: sql,
  }
  return stmt
}

function mockDb(
  articleResults: any[] = [],
  aggregateResults: any[] = [{ count: 0, last_ingestion: null }],
) {
  return {
    prepare: (sql: string) => {
      if (sql.includes("COUNT(*)") || sql.includes("MAX(")) {
        return makeD1Stmt(sql, aggregateResults)
      }
      return makeD1Stmt(sql, articleResults)
    },
  } as unknown as D1Database
}

function mockDbWithSpy(
  results: any[],
  onBind: (limit: number) => void,
) {
  return {
    prepare: (sql: string) => {
      let boundArgs: any[] = []
      const stmt = {
        bind: (...args: any[]) => {
          boundArgs = args
          onBind(args[0])
          return stmt
        },
        all: async () => ({ results }),
        run: async () => ({}),
        _args: boundArgs,
        _sql: sql,
      }
      return stmt
    },
  } as unknown as D1Database
}

function mockFailingDb() {
  const stmt = {
    bind: () => stmt,
    all: async () => {
      throw new Error("D1 connection lost")
    },
    run: async () => {},
  }
  return {
    prepare: () => stmt,
  } as unknown as D1Database
}
