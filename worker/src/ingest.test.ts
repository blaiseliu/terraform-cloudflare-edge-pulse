import { describe, it, expect, vi, beforeEach } from "vitest"
import { sha256, stripHtml, initSchema, IngestResult, Article } from "./ingest"

// ---------------------------------------------------------------------------
// sha256
// ---------------------------------------------------------------------------
describe("sha256", () => {
  it("computes SHA-256 of a string", async () => {
    const hash = await sha256("hello")
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
  })

  it("produces consistent output for same input", async () => {
    const a = await sha256("https://example.com/article/1")
    const b = await sha256("https://example.com/article/1")
    expect(a).toBe(b)
  })

  it("produces different output for different input", async () => {
    const a = await sha256("url-a")
    const b = await sha256("url-b")
    expect(a).not.toBe(b)
  })

  it("handles empty string", async () => {
    const hash = await sha256("")
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })
})

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------
describe("stripHtml", () => {
  it("strips HTML tags", () => {
    expect(stripHtml("<p>Hello world</p>")).toBe("Hello world")
  })

  it("collapses whitespace", () => {
    expect(stripHtml("<div>foo   bar\n  baz</div>")).toBe("foo bar baz")
  })

  it("handles nested tags", () => {
    expect(stripHtml('<div class="x"><p><span>nested</span> text</p></div>')).toBe("nested text")
  })

  it("returns empty string for undefined", () => {
    expect(stripHtml(undefined)).toBe("")
  })

  it("returns empty string for null", () => {
    expect(stripHtml(null)).toBe("")
  })

  it("returns empty string for object", () => {
    expect(stripHtml({ text: "value" })).toBe("")
  })

  it("passes through plain text unchanged", () => {
    expect(stripHtml("plain text without tags")).toBe("plain text without tags")
  })
})

// ---------------------------------------------------------------------------
// initSchema
// ---------------------------------------------------------------------------
describe("initSchema", () => {
  it("executes all schema statements in order", async () => {
    const runOrder: string[] = []
    const mockDb = {
      prepare: (sql: string) => ({
        run: async () => {
          runOrder.push(sql)
          return {}
        },
      }),
    } as unknown as D1Database

    await initSchema(mockDb)

    expect(runOrder.length).toBe(3)
    expect(runOrder[0]).toContain("CREATE TABLE IF NOT EXISTS articles")
    expect(runOrder[1]).toContain("CREATE INDEX IF NOT EXISTS idx_articles_url")
    expect(runOrder[2]).toContain("CREATE INDEX IF NOT EXISTS idx_articles_ingested_at")
  })
})

// ---------------------------------------------------------------------------
// fetchAndParseFeed — integration-light: mock the extractor
// ---------------------------------------------------------------------------
describe("fetchAndParseFeed", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("parses valid feed entries and strips HTML from descriptions", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        title: "Test Feed",
        entries: [
          {
            title: "Article One",
            link: "https://example.com/1",
            published: "2026-05-01",
            description: "<p>Content of article one</p>",
          },
        ],
      }),
    }))

    const { fetchAndParseFeed } = await import("./ingest")
    const articles = await fetchAndParseFeed()

    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe("Article One")
    expect(articles[0].url).toBe("https://example.com/1")
    expect(articles[0].source).toBe("Test Feed")
    expect(articles[0].content).toBe("Content of article one")
    expect(articles[0].published).toBe("2026-05-01")
  })

  it("filters out entries without a URL", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        entries: [
          { title: "No Link", link: "" },
          { title: "Has Link", link: "https://example.com/2" },
        ],
      }),
    }))

    const { fetchAndParseFeed } = await import("./ingest")
    const articles = await fetchAndParseFeed()

    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe("Has Link")
  })

  it("handles object-style descriptions", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        entries: [
          {
            title: "Object Desc",
            link: "https://example.com/3",
            description: { text: "<p>Nested text content</p>" },
          },
        ],
      }),
    }))

    const { fetchAndParseFeed } = await import("./ingest")
    const articles = await fetchAndParseFeed()

    expect(articles).toHaveLength(1)
    expect(articles[0].content).toBe("Nested text content")
  })

  it("returns empty array when feed has no entries", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({ entries: [] }),
    }))

    const { fetchAndParseFeed } = await import("./ingest")
    const articles = await fetchAndParseFeed()

    expect(articles).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------
describe("summarize", () => {
  it("truncates content to maxChars", async () => {
    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "test system prompt",
      buildUserPrompt: (title: string, content: string) =>
        `Title: ${title}\nContent: ${content}`,
    }))

    let receivedMessages: any[] = []
    const mockAi = {
      run: async (_model: any, opts: any) => {
        receivedMessages = opts.messages
        return { response: "A Chinese summary" }
      },
    } as unknown as Ai

    const { summarize } = await import("./ingest")
    const result = await summarize(mockAi, "test-model", "Test Title", "1234567890", 5)

    // Content should be truncated to 5 chars in the user prompt
    expect(receivedMessages[1].content).toContain("12345")
    expect(receivedMessages[1].content).not.toContain("67890")
    expect(result).toBe("A Chinese summary")
  })

  it("returns null on AI failure", async () => {
    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "prompt",
    }))

    const mockAi = {
      run: async () => {
        throw new Error("AI unavailable")
      },
    } as unknown as Ai

    const { summarize } = await import("./ingest")
    const result = await summarize(mockAi, "model", "title", "content", 2000)

    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ingest — full pipeline with mocks
// ---------------------------------------------------------------------------
describe("ingest", () => {
  function mockDb(existingIds: string[] = []) {
    const stmts: any[] = []
    return {
      db: {
        prepare: (sql: string) => {
          const stmt = {
            bind: (..._args: any[]) => {
              stmts.push({ sql, args: [..._args] })
              return stmt
            },
            all: async () => ({ results: existingIds.map((id) => ({ id })) }),
            run: async () => ({}),
          }
          return stmt
        },
        batch: async (_batchStmts: any[]) => ({}),
      } as unknown as D1Database,
      stmts,
    }
  }

  function mockAi() {
    return {
      run: async () => ({ response: "中文摘要内容" }),
    } as unknown as Ai
  }

  beforeEach(() => {
    vi.resetModules()
  })

  it("ingests new articles and returns processed count", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        title: "Feed",
        entries: [
          { title: "Article A", link: "https://a.com", description: "Content A" },
          { title: "Article B", link: "https://b.com", description: "Content B" },
        ],
      }),
    }))

    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "test prompt",
    }))

    const { ingest } = await import("./ingest")
    const { db, stmts } = mockDb()

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
    // Two INSERTs should have been batched
    const inserts = stmts.filter((s: any) => s.sql.includes("INSERT"))
    expect(inserts).toHaveLength(2)
  })

  it("skips already-ingested articles", async () => {
    const id = await sha256("https://existing.com")

    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        entries: [
          { title: "Existing", link: "https://existing.com", description: "Old" },
        ],
      }),
    }))

    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "test prompt",
    }))

    const { ingest } = await import("./ingest")
    const { db } = mockDb([id]) // article already exists

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it("catches feed fetch errors", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => {
        throw new Error("Network failure")
      },
    }))

    const { ingest } = await import("./ingest")
    const { db } = mockDb()

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("Feed fetch failed")
  })
})
