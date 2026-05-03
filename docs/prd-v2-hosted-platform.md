# PRD: Edge-Pulse v2.0.0 — Hosted Platform

**Status:** DRAFT | **Timeline:** After v1.0.0 has users | **Goal:** Paid hosted service with personalized AI digests

## What This Is

A hosted platform where users subscribe to topics, YouTube channels, RSS feeds, and newsletters, customize their AI summaries with personal prompts, and receive a personalized daily digest. The open-source Terraform module (v1.0.0) becomes the distribution channel — developers who deployed the free module are the funnel for the hosted upgrade.

**The pitch:** "Your own AI newsletter editor. Tell it what you care about, how you want it summarized, and when you want it. $0 to start."

## User Experience

### Onboarding (5 minutes to first digest)
1. Sign up with email (or Cloudflare account)
2. Pick interests from curated topics: "AI/ML research," "Cloud infrastructure," "Web development," "Startup ecosystem," or enter custom RSS/YouTube URLs
3. Set preferences: language, summary length (short/medium/deep), delivery time, delivery channel (email + web)
4. Optional: write a personal prompt ("Focus on architecture decisions and performance tradeoffs," "I'm learning Rust — explain concepts like I'm a beginner")
5. First digest arrives within 24 hours

### Daily Digest
- Email + web dashboard
- Personalized per user (two users subscribed to the same sources get different summaries based on their prompts)
- Article feed with: title, AI summary, source, relevance score, "save for later" / "mark as read"
- Weekly "top picks" based on user's reading history and explicit feedback

### Source Discovery
- Browse community-curated source lists by topic
- "People who subscribed to X also follow Y"
- Import OPML (RSS reader export)
- Connect YouTube channel subscriptions

## Pricing Tiers

| Tier | Price | Sources | Summaries/day | Features |
|---|---|---|---|---|
| **Free** | $0/mo | 3 sources | 15 articles | Chinese summaries, web dashboard |
| **Pro** | $5/mo | 20 sources | 100 articles | Custom prompts, email delivery, English/Chinese, save/bookmark |
| **Creator** | $15/mo | Unlimited | 500 articles | Multi-language, API access, priority AI processing, export to Obsidian/Notion |

## Architecture (Evolution from v1.0.0)

The Terraform module from v1.0.0 is the open-source core. The hosted platform is a managed layer on top:

```
                    ┌──────────────────────────────┐
                    │     Hosted Platform (v2.0)    │
                    │                              │
  Users ──────────▶│  Auth (Cloudflare Access)     │
                    │  User preferences database    │
                    │  Personalization engine       │
                    │  Email delivery (Resend)      │
                    │  Billing (Stripe)             │
                    │  Web dashboard                │
                    │                              │
                    │  ┌──────────────────────────┐ │
                    │  │   v1.0.0 Core (per-tenant)│ │
                    │  │   Ingestion Worker        │ │
                    │  │   D1 Database             │ │
                    │  │   Workers AI              │ │
                    │  └──────────────────────────┘ │
                    └──────────────────────────────┘
```

Key changes from v1.0.0:
- **Multi-tenant D1:** Separate D1 database per user (or row-level partitioning by `user_id`)
- **User preferences:** Stored in a new `user_prefs` table — sources, prompts, language, delivery schedule
- **Auth:** Cloudflare Access or custom JWT-based auth
- **Email delivery:** Cloudflare Queues → Resend API for daily email digests
- **Billing:** Stripe integration for Pro/Creator tiers
- **Dashboard:** Full web app (React/Next.js on Cloudflare Pages) replacing the static v1.0.0 frontend
- **Personalization:** Per-user prompt injection into Workers AI calls; reading history used for relevance scoring

## Open Questions (for v2.0.0 planning)

- Multi-tenant D1: separate databases or row-level partitioning? Cost and complexity tradeoff
- What's the simplest possible hosted MVP? One user, one source, one daily email — prove willingness to pay before building the full platform
- Does the free tier cannibalize the paid tiers, or is it a genuine funnel?
- How to migrate open-source users to the hosted platform? Export/import? One-click upgrade?

## Success Criteria

- Free → Pro conversion rate > 5%
- 90% of daily digests delivered by scheduled time
- Average digest open rate > 40% (industry average for newsletters is ~20%)
- Monthly churn < 5%
- Platform cost per free user < $0.10/month

## Dependencies

- v1.0.0 Terraform module must be stable and have real users
- Workers AI must support the throughput for multi-tenant summarization
- Stripe integration requires a legal entity for payment processing
- Email delivery requires domain reputation management

## Distribution

- Open-source v1.0.0 README links to hosted platform: "Want this without managing infrastructure? Try Edge-Pulse Pro."
- "Deploy your own" → "Upgrade to managed" funnel
- Hacker News / Product Hunt launch with both self-hosted and managed options

## The Hosted MVP Before the Full Platform

Before building the full v2.0.0, validate willingness to pay with a hosted MVP:

- **One user, one source, one daily email**
- Manual onboarding (you configure the source, you set the prompt)
- Stripe payment link for $5/month
- If 3 people pay, build the self-serve onboarding
- If nobody pays, the open-source module is still a win

This follows the same pattern as the weekend spike: prove the loop before building the platform.
