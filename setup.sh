#!/usr/bin/env bash
set -euo pipefail

echo "=== Edge-Pulse v1.0.0 Setup ==="
echo ""

# 1. Deploy Worker (must exist before cron trigger)
echo "--- Deploying Worker ---"
cd "$(dirname "$0")/worker"
npx wrangler deploy
echo ""

# 2. Provision infrastructure (D1 + Cron)
echo "--- Provisioning Infrastructure ---"
cd "$(dirname "$0")/terraform"
terraform init
terraform apply
echo ""

echo "=== Setup complete ==="
echo ""
echo "Endpoints:"
echo "  Frontend:  https://edge-pulse.${TF_VAR_cloudflare_account_id:-<your-account-id>}.workers.dev"
echo "  Health:    https://edge-pulse.${TF_VAR_cloudflare_account_id:-<your-account-id>}.workers.dev/health"
echo "  Ingest:    https://edge-pulse.${TF_VAR_cloudflare_account_id:-<your-account-id>}.workers.dev/ingest"
echo "  Articles:  https://edge-pulse.${TF_VAR_cloudflare_account_id:-<your-account-id>}.workers.dev/articles"
