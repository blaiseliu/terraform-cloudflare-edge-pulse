output "database_id" {
  description = "D1 database ID"
  value       = cloudflare_d1_database.edge_pulse.id
}

output "database_name" {
  description = "D1 database name"
  value       = cloudflare_d1_database.edge_pulse.name
}

output "worker_name" {
  description = "Worker script name"
  value       = cloudflare_worker_script.edge_pulse.name
}

output "worker_url" {
  description = "Worker URL — hit /ingest to manually trigger pipeline"
  value       = "https://edge-pulse.${var.cloudflare_account_id}.workers.dev/ingest"
}
