#!/usr/bin/env bash
set -eo pipefail

# Find Loki containers
LOKI_CONTAINERS=$(docker ps -a --filter "name=zero2prod-axum-loki" --format "{{.ID}}")
PROMTAIL_CONTAINERS=$(docker ps -a --filter "name=zero2prod-axum-promtail" --format "{{.ID}}")
GRAFANA_CONTAINERS=$(docker ps -a --filter "name=zero2prod-axum-grafana" --format "{{.ID}}")

ALL_CONTAINERS="${LOKI_CONTAINERS} ${PROMTAIL_CONTAINERS} ${GRAFANA_CONTAINERS}"
ALL_CONTAINERS=$(echo "$ALL_CONTAINERS" | xargs)  # Trim whitespace

if [[ -z "$ALL_CONTAINERS" ]]; then
  echo "No logging stack containers found"
  exit 0
fi

# Stop and remove
echo "Stopping and removing logging stack containers..."
echo "$ALL_CONTAINERS" | xargs docker rm -f

echo "Logging stack containers stopped and removed (Loki, Promtail, Grafana)"
