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
