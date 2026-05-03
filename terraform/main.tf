terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# Authenticate via CLOUDFLARE_API_TOKEN environment variable.
# Set CLOUDFLARE_API_TOKEN before running terraform apply.
provider "cloudflare" {}

resource "cloudflare_d1_database" "edge_pulse" {
  account_id = var.cloudflare_account_id
  name       = "edge-pulse-db"
}

resource "cloudflare_worker_script" "edge_pulse" {
  account_id          = var.cloudflare_account_id
  name                = "edge-pulse"
  content             = file("${path.module}/../worker/dist/index.js")
  module              = true
  compatibility_date  = "2025-06-01"
  compatibility_flags = ["nodejs_compat"]

  d1_database_binding {
    name        = "DB"
    database_id = cloudflare_d1_database.edge_pulse.id
  }

  plain_text_binding {
    name  = "AI_MODEL"
    text  = var.ai_model
  }

  plain_text_binding {
    name  = "MAX_CONTENT_CHARS"
    text  = tostring(var.max_content_chars)
  }
}

resource "cloudflare_worker_cron_trigger" "edge_pulse_ingest" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_worker_script.edge_pulse.name
  schedules = [
    "0 */6 * * *"
  ]
}
