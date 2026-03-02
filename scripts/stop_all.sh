#!/usr/bin/env bash
set -eo pipefail

# Find all zero2prod-axum containers
CONTAINERS=$(docker ps -a --filter "name=zero2prod-axum-" --format "{{.ID}}")

if [[ -z "$CONTAINERS" ]]; then
  echo "No zero2prod-axum containers found"
  exit 0
fi

# Count containers
COUNT=$(echo "$CONTAINERS" | wc -l)

# Stop and remove
echo "Stopping and removing $COUNT zero2prod-axum containers..."
echo "$CONTAINERS" | xargs docker rm -f

echo ""
echo "All local development containers stopped and removed:"
echo "  - Backend"
echo "  - Postgres"
echo "  - Redis"
echo "  - Loki (Logging stack)"
echo ""
echo "Note: This does NOT affect docker-compose containers (zero2prod-axum-*-1)"
