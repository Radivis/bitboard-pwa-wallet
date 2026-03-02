#!/usr/bin/env bash
set -eo pipefail

# Find Postgres containers
CONTAINERS=$(docker ps -a --filter "name=zero2prod-axum-postgres" --format "{{.ID}}")

if [[ -z "$CONTAINERS" ]]; then
  echo "No zero2prod-axum-postgres containers found"
  exit 0
fi

# Stop and remove
echo "Stopping and removing Postgres containers..."
echo "$CONTAINERS" | xargs docker rm -f

echo "Postgres containers stopped and removed"
