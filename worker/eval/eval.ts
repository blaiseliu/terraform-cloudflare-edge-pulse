/**
 * Manual eval script for summarization quality.
 *
 * Fetches live articles from the RSS feed, runs them through Workers AI,
 * and prints results side-by-side for human review.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx tsx eval/eval.ts [--count N]
 *
 * To install tsx: npm install -D tsx
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const MODEL = process.env.AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct"
const MAX_CHARS = parseInt(process.env.MAX_CONTENT_CHARS || "2000", 10)

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN")
  process.exit(1)
}

const count = parseInt(process.argv.find((a) => a.startsWith("--count="))?.split("=")[1] || "3", 10)

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function stripHtml(html: unknown): string {
  if (typeof html !== "string") return ""
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
}

const SYSTEM_PROMPT = `你是一位专业的技术内容编辑，擅长从英文技术文章中提取核心洞察并用简洁的中文表达。`

function buildUserPrompt(title: string, content: string): string {
  const truncated = content.slice(0, MAX_CHARS)
  return `请用2-3句中文总结以下技术文章的核心内容。要求：
1. 抓住文章的主要论点或发现，而非仅仅描述主题
2. 如果文章包含具体数据、实验结果或技术决策，请提及
3. 使用简洁、直接的中文，避免翻译腔
4. 150-250字之间

文章标题：${title}
文章内容：${truncated}`
}

async function runAI(model: string, title: string, content: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(title, content) },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AI API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as any
  return data.result?.response || "(no response)"
}

interface EvalEntry {
  title: string
  url: string
  contentChars: number
  summary: string
  summaryChars: number
  error?: string
}

async function main() {
  const { extract } = await import("@extractus/feed-extractor")

  console.log(`Fetching feed: https://simonwillison.net/atom/everything/\n`)

  const feed = await extract("https://simonwillison.net/atom/everything/", {
    getExtraFeedFields: () => ({}),
    getExtraEntryFields: (entry: any) => ({
      description: entry.description || entry.summary || "",
    }),
  })

  const entries = (feed.entries || []).slice(0, count)
  console.log(`Evaluating ${entries.length} articles with model: ${MODEL}\n`)

  const results: EvalEntry[] = []

  for (const entry of entries) {
    const title = entry.title || "Untitled"
    const raw = entry.description || ""
    const desc = typeof raw === "string" ? raw : raw?.text || raw?.["#text"] || String(raw)
    const content = stripHtml(desc)

    console.log(`──────────────────────────────────────────────────`)
    console.log(`Title: ${title}`)
    console.log(`URL:   ${entry.link || "(none)"}`)
    console.log(`Content (${content.length} chars): ${content.slice(0, 150)}...`)

    let summary = ""
    let error: string | undefined

    try {
      summary = await runAI(MODEL, title, content)
    } catch (err) {
      error = String(err)
      console.log(`ERROR: ${error}`)
    }

    console.log(`Summary (${summary.length} chars): ${summary}`)

    // Heuristic checks
    const hasChinese = /[一-鿿]/.test(summary)
    const tooShort = summary.length < 50
    const tooLong = summary.length > 300

    if (!hasChinese && summary) console.log(`  ⚠ No Chinese characters detected`)
    if (tooShort && summary) console.log(`  ⚠ Summary very short (< 50 chars)`)
    if (tooLong) console.log(`  ⚠ Summary very long (> 300 chars)`)
    if (error) console.log(`  ✗ Error`)

    console.log()

    results.push({
      title,
      url: entry.link || "",
      contentChars: content.length,
      summary,
      summaryChars: summary.length,
      error,
    })
  }

  // Summary stats
  const succeeded = results.filter((r) => !r.error)
  const failed = results.filter((r) => r.error)
  const chineseCount = succeeded.filter((r) => /[一-鿿]/.test(r.summary)).length

  console.log(`═══════════════════════════════════════════════════`)
  console.log(`Results: ${succeeded.length}/${results.length} succeeded`)
  console.log(`Chinese summaries: ${chineseCount}/${succeeded.length}`)
  console.log(`Avg summary length: ${Math.round(succeeded.reduce((s, r) => s + r.summaryChars, 0) / (succeeded.length || 1))} chars`)
  if (failed.length) {
    console.log(`\nFailures:`)
    for (const f of failed) console.log(`  - ${f.title}: ${f.error}`)
  }
}

main().catch((err) => {
  console.error("Eval failed:", err)
  process.exit(1)
})
