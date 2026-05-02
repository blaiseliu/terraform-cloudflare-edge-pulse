# PRD: Automated AI Content Pipeline (Project: "Edge-Pulse")

## 1. Executive Summary
The objective of this project is to build a zero-maintenance, serverless content aggregation and summarization engine. The system will ingest information from various technical sources (RSS, Hacker News, niche blogs), use Edge-based LLMs to synthesize the data into structured summaries, and provide a clean frontend for consumption. All infrastructure will be managed as code via **Terraform**.

---

## 2. Target Audience
* **Primary:** Technical creators and architects requiring a "Second Brain" ingestion layer.
* **Secondary:** Curated newsletter readers or team members monitoring industry trends.

---

## 3. Functional Requirements

### 3.1 Content Ingestion (The "Crawler")
* **Scheduled Triggers:** Automated polling of specified endpoints (RSS, JSON, or HTML) at configurable intervals.
* **Duplicate Detection:** Ability to filter out previously processed URLs before reaching the AI processing layer to conserve "neuron" usage.
* **Raw Data Archival:** Storage of original JSON/HTML payloads for future re-processing or debugging.

### 3.2 AI Processing Layer
* **Summarization:** Generate concise, high-density summaries in Chinese (or target language).
* **Semantic Tagging:** Extract keywords and categories for database indexing.
* **Sentiment/Importance Scoring:** Assign a weight to articles to allow for "top-pick" filtering on the frontend.

### 3.3 Data Management
* **Structured Storage:** Metadata (Title, URL, Summary, Tags, Score) must be stored in a relational format.
* **Object Storage:** Management of assets (images/original snapshots) without egress fees.

### 3.4 Presentation Layer
* **Responsive Frontend:** A high-performance, static-first web interface to view curated content.
* **API Access:** A JSON endpoint for potential integration with other productivity tools (e.g., Obsidian or .NET-based reflectors).

---

## 4. Technical Architecture (Cloudflare Stack)

| Component | Role | Specific Service |
| :--- | :--- | :--- |
| **Orchestration** | Scheduling and Logic | **Workers + Cron Triggers** |
| **Intelligence** | NLP & Summarization | **Workers AI (Llama 3.1 / Mistral)** |
| **Storage (Object)** | Raw Data & Snapshots | **R2 Buckets** |
| **Storage (SQL)** | Metadata & Indexing | **D1 Database** |
| **Hosting** | UI & API Hosting | **Pages (with Functions)** |

---

## 5. Infrastructure Strategy (Terraform)

The environment will be defined using the `cloudflare/cloudflare` provider. This ensures reproducibility and allows the pipeline to be torn down or replicated across different accounts.

### 5.1 Resource Map
* `cloudflare_worker_script`: The core logic for scraping and AI orchestration.
* `cloudflare_worker_cron_trigger`: Definition of the execution schedule.
* `cloudflare_d1_database`: Initialization of the SQLite-compatible store.
* `cloudflare_r2_bucket`: Configuration of the content store (including public/private access rules).
* `cloudflare_pages_project`: Management of the CI/CD pipeline for the frontend.

### 5.2 Environment Configuration
* **Bindings:** All resources (D1, R2, AI) must be bound to the Worker via Terraform variables to avoid hardcoded IDs in the logic.
* **Secret Management:** Integration with Cloudflare Secrets for any external API keys (e.g., specialized scraper services).

---

## 6. Development Workflow & Harnessing
To maintain architectural continuity and support "agentic steering," the repository will include:
* **Development Harness:** A `PI_SYSTEM_PROMPT.md` and `ARCH_STATE.md` to maintain context for AI agents assisting in development.
* **Migrations:** SQL migration scripts managed through the `wrangler` CLI but triggered or tracked within the Terraform state.

---

## 7. Data Schema (D1)

```sql
CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    summary TEXT,
    tags TEXT, -- Stored as comma-separated or JSON
    score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_r2_path TEXT
);
```

---

## 8. Success Metrics
* **Reliability:** 99.9% successful execution of Cron triggers.
* **Efficiency:** Average processing time per article under 2 seconds.
* **Cost:** Total monthly expenditure within the Cloudflare Free/Pro tier limits ($0 - $5/mo).
* **Usability:** Frontend PageSpeed score > 90 on mobile/desktop.