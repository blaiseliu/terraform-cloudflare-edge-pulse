output "database_id" {
  description = "D1 database ID — reference in wrangler.toml [[d1_databases]]"
  value       = cloudflare_d1_database.edge_pulse.id
}

output "database_name" {
  description = "D1 database name"
  value       = cloudflare_d1_database.edge_pulse.name
}

output "worker_url" {
  description = "Worker URL — frontend at /, health at /health, ingest at /ingest"
  value       = "https://edge-pulse.${var.cloudflare_account_id}.workers.dev"
}

output "setup_script" {
  description = "Path to the full deployment script (terraform apply + wrangler deploy)"
  value       = "${path.module}/../setup.sh"
}
