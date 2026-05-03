import { describe, it, expect, vi, beforeEach } from "vitest"
import { sha256, stripHtml } from "./ingest"

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
// ensureSchema
// ---------------------------------------------------------------------------
describe("ensureSchema", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("creates table, indexes, and runs migration statements", async () => {
    const runOrder: string[] = []
    const mockDb = {
      prepare: (sql: string) => ({
        run: async () => {
          runOrder.push(sql)
          return {}
        },
      }),
    } as unknown as D1Database

    const { ensureSchema } = await import("./ingest")
    await ensureSchema(mockDb)

    expect(runOrder[0]).toContain("CREATE TABLE IF NOT EXISTS articles")
    expect(runOrder[1]).toContain("CREATE INDEX IF NOT EXISTS idx_articles_url")
    expect(runOrder[2]).toContain("CREATE INDEX IF NOT EXISTS idx_articles_ingested_at")
    expect(runOrder[3]).toContain("ALTER TABLE articles ADD COLUMN feed_url")
    expect(runOrder[4]).toContain("CREATE INDEX IF NOT EXISTS idx_articles_feed_url")
  })

  it("silently ignores migration failure (column already exists)", async () => {
    const runCalls: string[] = []
    const mockDb = {
      prepare: (sql: string) => ({
        run: async () => {
          runCalls.push(sql)
          if (sql.includes("ALTER TABLE")) throw new Error("column exists")
          return {}
        },
      }),
    } as unknown as D1Database

    const { ensureSchema } = await import("./ingest")
    // Should not throw
    await ensureSchema(mockDb)
    expect(runCalls.filter((s) => s.includes("ALTER TABLE"))).toHaveLength(1)
  })

  it("only executes schema once (Promise gate)", async () => {
    const runCounts = new Map<string, number>()
    const mockDb = {
      prepare: (sql: string) => ({
        run: async () => {
          runCounts.set(sql, (runCounts.get(sql) || 0) + 1)
          return {}
        },
      }),
    } as unknown as D1Database

    const { ensureSchema } = await import("./ingest")
    await ensureSchema(mockDb)
    await ensureSchema(mockDb)

    for (const count of runCounts.values()) {
      expect(count).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// fetchFeed (per-source)
// ---------------------------------------------------------------------------
describe("fetchFeed", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("parses valid feed entries with source name and feedUrl", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        title: "Feed Title",
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

    const { fetchAllFeeds } = await import("./ingest")
    const sources = [{ url: "https://example.com/feed", name: "Example Feed", type: "rss" as const }]
    const { articles, errors } = await fetchAllFeeds(sources)

    expect(errors).toHaveLength(0)
    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe("Article One")
    expect(articles[0].url).toBe("https://example.com/1")
    expect(articles[0].source).toBe("Example Feed")
    expect(articles[0].feedUrl).toBe("https://example.com/feed")
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

    const { fetchAllFeeds } = await import("./ingest")
    const { articles } = await fetchAllFeeds([
      { url: "https://example.com", name: "Test", type: "rss" },
    ])

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

    const { fetchAllFeeds } = await import("./ingest")
    const { articles } = await fetchAllFeeds([
      { url: "https://example.com", name: "Test", type: "rss" },
    ])

    expect(articles).toHaveLength(1)
    expect(articles[0].content).toBe("Nested text content")
  })

  it("returns empty array when feed has no entries", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({ entries: [] }),
    }))

    const { fetchAllFeeds } = await import("./ingest")
    const { articles } = await fetchAllFeeds([
      { url: "https://example.com", name: "Test", type: "rss" },
    ])

    expect(articles).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// fetchAllFeeds — multi-source
// ---------------------------------------------------------------------------
describe("fetchAllFeeds", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("fetches from multiple sources in parallel and merges articles", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async (url: string) => ({
        title: url,
        entries: [
          { title: `Article from ${url}`, link: url + "/1", description: "Content" },
        ],
      }),
    }))

    const { fetchAllFeeds } = await import("./ingest")
    const sources = [
      { url: "https://a.com/feed", name: "Feed A", type: "rss" as const },
      { url: "https://b.com/feed", name: "Feed B", type: "rss" as const },
      { url: "https://c.com/feed", name: "Feed C", type: "rss" as const },
    ]
    const { articles, errors } = await fetchAllFeeds(sources)

    expect(errors).toHaveLength(0)
    expect(articles).toHaveLength(3)
    expect(articles.map((a) => a.source)).toEqual(["Feed A", "Feed B", "Feed C"])
  })

  it("isolates failures — one broken feed does not block others", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async (url: string) => {
        if (url === "https://broken.com/feed") throw new Error("Network failure")
        return {
          title: url,
          entries: [{ title: "OK", link: url + "/1", description: "OK" }],
        }
      },
    }))

    const { fetchAllFeeds } = await import("./ingest")
    const sources = [
      { url: "https://good.com/feed", name: "Good", type: "rss" as const },
      { url: "https://broken.com/feed", name: "Broken", type: "rss" as const },
    ]
    const { articles, errors } = await fetchAllFeeds(sources)

    expect(articles).toHaveLength(1)
    expect(articles[0].source).toBe("Good")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Broken")
    expect(errors[0]).toContain("Network failure")
  })

  it("returns empty articles when all sources fail", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => {
        throw new Error("All down")
      },
    }))

    const { fetchAllFeeds } = await import("./ingest")
    const sources = [
      { url: "https://a.com", name: "A", type: "rss" as const },
      { url: "https://b.com", name: "B", type: "rss" as const },
    ]
    const { articles, errors } = await fetchAllFeeds(sources)

    expect(articles).toHaveLength(0)
    expect(errors).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// batchDedup
// ---------------------------------------------------------------------------
describe("batchDedup", () => {
  it("returns only articles whose URLs are not in the database", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [{ url: "https://existing.com/1" }],
          }),
        }),
      }),
    } as unknown as D1Database

    const { batchDedup } = await import("./ingest")
    const articles = [
      { id: "", title: "Existing", url: "https://existing.com/1", source: "S", feedUrl: "f", published: null, content: "" },
      { id: "", title: "New", url: "https://new.com/2", source: "S", feedUrl: "f", published: null, content: "" },
    ]
    const result = await batchDedup(mockDb, articles)

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("New")
  })

  it("returns all articles when database is empty", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
        }),
      }),
    } as unknown as D1Database

    const { batchDedup } = await import("./ingest")
    const articles = [
      { id: "", title: "A", url: "https://a.com", source: "S", feedUrl: "f", published: null, content: "" },
      { id: "", title: "B", url: "https://b.com", source: "S", feedUrl: "f", published: null, content: "" },
    ]
    const result = await batchDedup(mockDb, articles)

    expect(result).toHaveLength(2)
  })

  it("returns empty array when all articles already exist", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [{ url: "https://a.com" }, { url: "https://b.com" }],
          }),
        }),
      }),
    } as unknown as D1Database

    const { batchDedup } = await import("./ingest")
    const articles = [
      { id: "", title: "A", url: "https://a.com", source: "S", feedUrl: "f", published: null, content: "" },
      { id: "", title: "B", url: "https://b.com", source: "S", feedUrl: "f", published: null, content: "" },
    ]
    const result = await batchDedup(mockDb, articles)

    expect(result).toHaveLength(0)
  })

  it("handles empty input array", async () => {
    const { batchDedup } = await import("./ingest")
    const mockDb = {} as unknown as D1Database
    const result = await batchDedup(mockDb, [])
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------
describe("summarize", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("truncates content to maxChars", async () => {
    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "test system prompt",
      buildUserPrompt: (_title: string, content: string) =>
        `Title: test\nContent: ${content}`,
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
// summarizeAll — parallel AI
// ---------------------------------------------------------------------------
describe("summarizeAll", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("summarizes all articles in parallel", async () => {
    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "prompt",
    }))

    let callCount = 0
    const mockAi = {
      run: async () => {
        callCount++
        return { response: `Summary ${callCount}` }
      },
    } as unknown as Ai

    const { summarizeAll } = await import("./ingest")
    const articles = [
      { id: "", title: "A", url: "https://a.com", source: "S", feedUrl: "f", published: null, content: "c" },
      { id: "", title: "B", url: "https://b.com", source: "S", feedUrl: "f", published: null, content: "c" },
    ]
    const results = await summarizeAll(mockAi, "model", articles, 2000)

    expect(results).toHaveLength(2)
    expect(callCount).toBe(2)
    expect(results[0].summary).toBe("Summary 1")
    expect(results[1].summary).toBe("Summary 2")
    expect(results[0].title).toBe("A")
  })

  it("one AI failure produces null summary for that article only", async () => {
    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "prompt",
    }))

    let callCount = 0
    const mockAi = {
      run: async () => {
        callCount++
        if (callCount === 2) throw new Error("AI timeout")
        return { response: "Good summary" }
      },
    } as unknown as Ai

    const { summarizeAll } = await import("./ingest")
    const articles = [
      { id: "", title: "Good", url: "https://good.com", source: "S", feedUrl: "f", published: null, content: "c" },
      { id: "", title: "Bad", url: "https://bad.com", source: "S", feedUrl: "f", published: null, content: "c" },
      { id: "", title: "Good2", url: "https://good2.com", source: "S", feedUrl: "f", published: null, content: "c" },
    ]
    const results = await summarizeAll(mockAi, "model", articles, 2000)

    expect(results).toHaveLength(3)
    expect(results[0].summary).toBe("Good summary")
    expect(results[1].summary).toBeNull()
    expect(results[2].summary).toBe("Good summary")
  })
})

// ---------------------------------------------------------------------------
// ingest — full multi-source pipeline
// ---------------------------------------------------------------------------
describe("ingest", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  function mockDb(existingUrls: string[] = []) {
    const stmts: any[] = []
    const db = {
      prepare: (sql: string) => {
        const stmt: any = {
          _sql: sql,
          _args: [] as any[],
          bind: (...args: any[]) => {
            stmt._args = args
            stmts.push({ sql, args: [...args] })
            return stmt
          },
          all: async () => {
            // Return existing URLs for dedup queries
            if (sql.includes("SELECT url FROM articles WHERE url IN")) {
              return { results: existingUrls.map((url) => ({ url })) }
            }
            return { results: [] }
          },
          run: async () => ({}),
        }
        return stmt
      },
      batch: async () => ({}),
    } as unknown as D1Database
    return { db, stmts }
  }

  function mockAi() {
    return {
      run: async () => ({ response: "中文摘要内容" }),
    } as unknown as Ai
  }

  // Source config used by the module — we mock the global SOURCES
  // by mocking the extractor per URL

  it("ingests new articles via full multi-source pipeline", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async (url: string) => ({
        title: url,
        entries: [
          { title: "Article A", link: url + "/1", description: "Content A" },
          { title: "Article B", link: url + "/2", description: "Content B" },
        ],
      }),
    }))

    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "test prompt",
    }))

    // Override sources for deterministic test
    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://feed1.com/rss", name: "Feed 1", type: "rss" },
        { url: "https://feed2.com/rss", name: "Feed 2", type: "rss" },
      ],
    }))

    const { ingest } = await import("./ingest")
    const { db, stmts } = mockDb()

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(4)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)

    const inserts = stmts.filter((s: any) => s.sql.includes("INSERT"))
    expect(inserts).toHaveLength(4)
    // Verify feed_url is included in INSERT values
    expect(inserts[0].args).toContain("https://feed1.com/rss")
  })

  it("deduplicates across all sources", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async (url: string) => ({
        title: url,
        entries: [
          { title: "New Article", link: url + "/new", description: "Fresh" },
        ],
      }),
    }))

    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "test prompt",
    }))

    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://feed.com/rss", name: "Feed", type: "rss" },
      ],
    }))

    const { ingest } = await import("./ingest")
    const { db } = mockDb(["https://feed.com/rss/new"]) // already ingested

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it("one failing feed leaves partial results and errors", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async (url: string) => {
        if (url === "https://bad.com/rss") throw new Error("404 Not Found")
        return {
          title: url,
          entries: [{ title: "Good Article", link: url + "/1", description: "OK" }],
        }
      },
    }))

    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "test prompt",
    }))

    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://good.com/rss", name: "Good Feed", type: "rss" },
        { url: "https://bad.com/rss", name: "Bad Feed", type: "rss" },
      ],
    }))

    const { ingest } = await import("./ingest")
    const { db, stmts } = mockDb()

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(1)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain("Bad Feed")
    expect(result.errors[0]).toContain("404")

    const inserts = stmts.filter((s: any) => s.sql.includes("INSERT"))
    expect(inserts).toHaveLength(1)
  })

  it("returns early when all feeds fail", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => {
        throw new Error("Network down")
      },
    }))

    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://a.com", name: "A", type: "rss" },
        { url: "https://b.com", name: "B", type: "rss" },
      ],
    }))

    const { ingest } = await import("./ingest")
    const { db } = mockDb()

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  it("returns early when dedup query fails", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        title: "Feed",
        entries: [{ title: "Article", link: "https://a.com/1", description: "OK" }],
      }),
    }))

    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://feed.com/rss", name: "Feed", type: "rss" },
      ],
    }))

    const { ingest } = await import("./ingest")
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          all: async () => {
            throw new Error("D1 query timeout")
          },
        }),
      }),
    } as unknown as D1Database

    const result = await ingest(mockDb, mockAi(), "model", 2000)

    expect(result.processed).toBe(0)
    expect(result.errors[0]).toContain("Dedup query failed")
  })

  it("returns early when no new articles after dedup", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async (url: string) => ({
        title: url,
        entries: [{ title: "Old", link: url + "/1", description: "Old" }],
      }),
    }))

    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://feed.com/rss", name: "Feed", type: "rss" },
      ],
    }))

    const { ingest } = await import("./ingest")
    const { db } = mockDb(["https://feed.com/rss/1"])

    const result = await ingest(db, mockAi(), "model", 2000)

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it("catches D1 batch insert failure", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        title: "Feed",
        entries: [{ title: "Article", link: "https://a.com/1", description: "OK" }],
      }),
    }))

    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "prompt",
    }))

    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://feed.com/rss", name: "Feed", type: "rss" },
      ],
    }))

    const { ingest } = await import("./ingest")
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          all: async () => ({ results: [] }),
          _sql: sql,
          _args: args,
        }),
      }),
      batch: async () => {
        throw new Error("D1 batch write failed")
      },
    } as unknown as D1Database

    const result = await ingest(mockDb, mockAi(), "model", 2000)

    expect(result.processed).toBe(1) // Counted before batch attempt
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain("D1 batch insert failed")
  })

  it("stores article with null summary when summarize fails", async () => {
    vi.doMock("@extractus/feed-extractor", () => ({
      extract: async () => ({
        title: "Feed",
        entries: [
          { title: "Article", link: "https://a.com/1", description: "Will fail summary" },
        ],
      }),
    }))

    vi.doMock("./prompt", () => ({
      SYSTEM_PROMPT: "",
      buildUserPrompt: () => "prompt",
    }))

    vi.doMock("./sources", () => ({
      SOURCES: [
        { url: "https://feed.com/rss", name: "Feed", type: "rss" },
      ],
    }))

    const mockAi = {
      run: async () => {
        throw new Error("AI unavailable")
      },
    } as unknown as Ai

    const { ingest } = await import("./ingest")
    const { db, stmts } = mockDb()

    const result = await ingest(db, mockAi, "model", 2000)

    expect(result.processed).toBe(1)
    const inserts = stmts.filter((s: any) => s.sql.includes("INSERT"))
    expect(inserts).toHaveLength(1)
    // summary_zh should be null (args: id, title, url, source_name, feed_url, summary_zh, published_at)
    expect(inserts[0].args[5]).toBeNull()
  })
})
