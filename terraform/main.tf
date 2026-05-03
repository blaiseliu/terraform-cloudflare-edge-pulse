terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {}

locals {
  worker_name = "edge-pulse"
}

resource "cloudflare_d1_database" "edge_pulse" {
  account_id = var.cloudflare_account_id
  name       = "edge-pulse-db"
}

# Cron trigger references the Worker by name.
# The Worker must be deployed via wrangler before terraform apply.
# setup.sh handles this ordering automatically.
resource "cloudflare_worker_cron_trigger" "edge_pulse_ingest" {
  account_id  = var.cloudflare_account_id
  script_name = local.worker_name
  schedules = [
    "0 */6 * * *",
  ]
}
