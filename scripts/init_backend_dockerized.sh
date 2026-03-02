#!/usr/bin/env bash
set -x
set -eo pipefail

# Check if backend container is already running
RUNNING_BACKEND=$(docker ps --filter 'name=zero2prod-axum-backend' --format '{{.ID}}')
if [[ -n $RUNNING_BACKEND ]]; then
  echo >&2 "There is a zero2prod-axum-backend container already running, kill it with:"
  echo >&2 "    docker kill ${RUNNING_BACKEND}"
  exit 1
fi

# Get the absolute path to the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Check if the Docker image exists, if not build it
IMAGE_EXISTS=$(docker images -q zero2prod:dev 2> /dev/null)
if [[ -z "$IMAGE_EXISTS" ]]; then
  echo >&2 "Docker image 'zero2prod:dev' not found. Building..."
  cd "${PROJECT_ROOT}"
  docker build -t zero2prod:dev .
  echo >&2 "Build complete!"
else
  echo >&2 "Using existing Docker image 'zero2prod:dev'"
  echo >&2 "To rebuild, run: docker build -t zero2prod:dev ."
fi

# Launch the backend container
echo >&2 "Starting zero2prod-axum backend in Docker..."
docker run \
  -d \
  --name "zero2prod-axum-backend_$(date '+%s')" \
  -p "8000:8000" \
  -e "APP_ENVIRONMENT=local" \
  -e "APP_APPLICATION__HOST=0.0.0.0" \
  -e "APP_APPLICATION__BASE_URL=http://localhost:8000" \
  -e "APP_APPLICATION__HMAC_SECRET=long-and-very-secret-random-key-needed-to-verify-message-integrity" \
  -e "APP_DATABASE__HOST=host.docker.internal" \
  -e "APP_DATABASE__PORT=5432" \
  -e "APP_DATABASE__USERNAME=app" \
  -e "APP_DATABASE__PASSWORD=secret" \
  -e "APP_DATABASE__DATABASE_NAME=newsletter" \
  -e "APP_DATABASE__REQUIRE_SSL=false" \
  -e "APP_EMAIL_CLIENT__SENDER_EMAIL=test@example.com" \
  -e "APP_EMAIL_CLIENT__AUTHORIZATION_TOKEN=fake-token-for-dev" \
  -e "APP_REDIS_URI=redis://host.docker.internal:6379" \
  --add-host=host.docker.internal:host-gateway \
  zero2prod:dev

# Wait for the backend to be ready
echo >&2 "Waiting for backend to be ready..."
TIMEOUT=30
ELAPSED=0
until curl -s http://localhost:8000/health_check > /dev/null 2>&1; do
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo >&2 "ERROR: Backend failed to start within ${TIMEOUT} seconds"
    echo >&2 "Check logs with: docker logs \$(docker ps --filter 'name=zero2prod-axum-backend' --format '{{.ID}}')"
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo >&2 ""
echo >&2 "======================================"
echo >&2 "Backend is ready!"
echo >&2 "======================================"
echo >&2 ""
echo >&2 "API: http://localhost:8000"
echo >&2 "Health check: http://localhost:8000/health_check"
echo >&2 ""
echo >&2 "Prerequisites:"
echo >&2 "  - Postgres must be running (./scripts/init_postgres.sh)"
echo >&2 "  - Redis must be running (./scripts/init_redis.sh)"
echo >&2 ""
echo >&2 "To view logs in Grafana:"
echo >&2 "  1. Start logging stack: ./scripts/init_loki.sh"
echo >&2 "  2. Open http://localhost:3200"
echo >&2 "  3. Query: {container_name=~\".*zero2prod-axum-backend.*\"}"
echo >&2 ""
echo >&2 "Container name: $(docker ps --filter 'name=zero2prod-axum-backend' --format '{{.Names}}')"
echo >&2 ""
