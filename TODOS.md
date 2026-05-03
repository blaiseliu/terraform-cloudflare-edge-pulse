# TODOS

## 1. Migrate to cloudflare_worker_version when Terraform provider bug is fixed

**What:** Replace `cloudflare_worker_script` (deprecated) with `cloudflare_worker_version` (provider v5 API) using the unified `bindings` array.

**Why:** `cloudflare_worker_script` is deprecated and will be removed in a future provider version. The v5 `cloudflare_worker_version` resource is blocked by [GitHub issue #6285](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6285) — multiple bindings produce inconsistent apply errors.

**Pros:** Modern API, future-proof, unified binding model.
**Cons:** Currently broken for our multi-binding use case (D1 + AI). Waiting for upstream fix.
**Context:** Currently using `cloudflare_worker_script` with separate `d1_database_binding` and `ai_binding` blocks. The Worker has two bindings: D1 (`DB`) and Workers AI. When #6285 is resolved, migrate to `cloudflare_worker_version` with `bindings = [{type="d1", name="DB", id=...}, {type="ai", name="AI"}]`.
**Depends on:** Cloudflare terraform-provider-cloudflare fix for issue #6285.

## 2. Add cron healthcheck alerting

**What:** When the cron trigger silently fails (no new D1 rows for >12 hours), send an alert via email or webhook.

**Why:** The current failure mode table lists "Cron silently fails → Manual check." This is acceptable for v0.1.0 spike but not for v1.0.0 production use. Silent cron failure means users stop getting digests without knowing why.

**Pros:** Production reliability, matches "zero-maintenance" promise.
**Cons:** Requires an outbound notification channel (Resend, Slack webhook, or email service). Adds a dependency or a new Worker binding.
**Context:** The `/health` endpoint already returns `last_ingestion` timestamp. Alerting could be: (1) a second cron Worker that hits `/health` and alerts if staleness >12h, or (2) an external healthcheck service (Cloudflare's own health checks, or tools like Better Uptime) pinging the health endpoint.
**Depends on:** Decision on notification channel (email vs webhook vs external service).

## 3. Add CI/CD pipeline with terraform plan

**What:** GitHub Actions workflow that: (1) builds Worker, (2) verifies committed bundle matches, (3) runs `terraform validate` and `terraform fmt --check`, (4) runs `terraform plan` against a real Cloudflare account (optional, requires API token in secrets).

**Why:** Manual terraform + wrangler workflow is acceptable for a spike. v1.0.0 needs automated validation to prevent broken Terraform module releases.

**Pros:** Catches stale builds, syntax errors, and binding misconfigurations before release.
**Cons:** Requires storing `CLOUDFLARE_API_TOKEN` in GitHub Secrets. `terraform plan` against production account adds risk of accidental applies if not scoped correctly.
**Context:** The design doc's Distribution Plan already describes this CI pipeline. For the spike, all steps are manual. For v1.0.0, this should be the first thing added after the spike succeeds.
**Depends on:** v1.0.0 scope decision (CI before or after Terraform Registry publication?)
