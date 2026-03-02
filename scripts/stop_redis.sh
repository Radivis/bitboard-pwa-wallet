#!/usr/bin/env bash
set -eo pipefail

# Find Redis containers
CONTAINERS=$(docker ps -a --filter "name=zero2prod-axum-redis" --format "{{.ID}}")

if [[ -z "$CONTAINERS" ]]; then
  echo "No zero2prod-axum-redis containers found"
  exit 0
fi

# Stop and remove
echo "Stopping and removing Redis containers..."
echo "$CONTAINERS" | xargs docker rm -f

echo "Redis containers stopped and removed"
