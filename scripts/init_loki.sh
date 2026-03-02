#!/usr/bin/env bash
set -x
set -eo pipefail

# Check if Loki container is already running
RUNNING_LOKI=$(docker ps --filter 'name=loki' --format '{{.ID}}')
if [[ -n $RUNNING_LOKI ]]; then
  echo >&2 "There is a Loki container already running, kill it with:"
  echo >&2 "    docker kill ${RUNNING_LOKI}"
  exit 1
fi

# Check if Promtail container is already running
RUNNING_PROMTAIL=$(docker ps --filter 'name=promtail' --format '{{.ID}}')
if [[ -n $RUNNING_PROMTAIL ]]; then
  echo >&2 "There is a Promtail container already running, kill it with:"
  echo >&2 "    docker kill ${RUNNING_PROMTAIL}"
  exit 1
fi

# Check if Grafana container is already running
RUNNING_GRAFANA=$(docker ps --filter 'name=grafana' --format '{{.ID}}')
if [[ -n $RUNNING_GRAFANA ]]; then
  echo >&2 "There is a Grafana container already running, kill it with:"
  echo >&2 "    docker kill ${RUNNING_GRAFANA}"
  exit 1
fi

# Get the absolute path to the project root (where the script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMP_PROMTAIL_CONFIG=""
TEMP_GRAFANA_DATASOURCE=""

cleanup_temp_files() {
  if [[ -n "${TEMP_PROMTAIL_CONFIG:-}" && -f "${TEMP_PROMTAIL_CONFIG}" ]]; then
    rm -f "${TEMP_PROMTAIL_CONFIG}"
  fi
  if [[ -n "${TEMP_GRAFANA_DATASOURCE:-}" && -f "${TEMP_GRAFANA_DATASOURCE}" ]]; then
    rm -f "${TEMP_GRAFANA_DATASOURCE}"
  fi
}

trap cleanup_temp_files EXIT

# Launch Loki
echo >&2 "Starting Loki..."
docker run \
  -d \
  --name "zero2prod-axum-loki_$(date '+%s')" \
  -p "3100:3100" \
  -v "${PROJECT_ROOT}/loki-config.yaml:/etc/loki/local-config.yaml:ro" \
  grafana/loki:3.0.0 \
  -config.file=/etc/loki/local-config.yaml

# Wait for Loki to be ready
echo >&2 "Waiting for Loki to be ready (this takes ~15-20 seconds)..."
TIMEOUT=60
ELAPSED=0
until curl -s http://localhost:3100/ready 2>/dev/null | grep -q "ready"; do
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo >&2 "ERROR: Loki failed to start within ${TIMEOUT} seconds"
    echo >&2 "Check logs with: docker logs \$(docker ps --filter 'name=loki' --format '{{.ID}}')"
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo >&2 "Loki is ready!"

# Launch Promtail with inline config using localhost
echo >&2 "Starting Promtail..."

# Create temp config file for Promtail
TEMP_PROMTAIL_CONFIG=$(mktemp)
cat > "$TEMP_PROMTAIL_CONFIG" <<'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0
  log_level: info

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://localhost:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container_name'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'compose_service'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_project']
        target_label: 'compose_project'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_image']
        target_label: 'image'
      - replacement: 'docker'
        target_label: 'job'
    
    pipeline_stages:
      - json:
          expressions:
            level: level
            msg: msg
            timestamp: timestamp
            target: target
            span: span
      - timestamp:
          source: timestamp
          format: RFC3339Nano
      - labels:
          level:
          target:
EOF
chmod 644 "$TEMP_PROMTAIL_CONFIG"

docker run \
  -d \
  --name "zero2prod-axum-promtail_$(date '+%s')" \
  -v "${TEMP_PROMTAIL_CONFIG}:/etc/promtail/config.yaml:ro" \
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --network host \
  grafana/promtail:3.0.0 \
  -config.file=/etc/promtail/config.yaml

echo >&2 "Promtail is ready!"

# Launch Grafana with inline datasource config using localhost
echo >&2 "Starting Grafana..."
GRAFANA_DATASOURCE_CONFIG=$(cat <<'EOF'
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://localhost:3100
    isDefault: true
    version: 1
    editable: false
    jsonData:
      maxLines: 1000
EOF
)

# Create temp file for Grafana datasource config
TEMP_GRAFANA_DATASOURCE=$(mktemp)
echo "$GRAFANA_DATASOURCE_CONFIG" > "$TEMP_GRAFANA_DATASOURCE"
chmod 644 "$TEMP_GRAFANA_DATASOURCE"

docker run \
  -d \
  --name "zero2prod-axum-grafana_$(date '+%s')" \
  -e "GF_SECURITY_ADMIN_USER=admin" \
  -e "GF_SECURITY_ADMIN_PASSWORD=admin" \
  -e "GF_USERS_ALLOW_SIGN_UP=false" \
  -e "GF_SERVER_HTTP_PORT=3200" \
  -v "${TEMP_GRAFANA_DATASOURCE}:/etc/grafana/provisioning/datasources/datasource.yaml:ro" \
  --network host \
  grafana/grafana:11.0.0

# Wait for Grafana to be ready
echo >&2 "Waiting for Grafana to be ready..."
TIMEOUT=60
ELAPSED=0
until curl -s http://localhost:3200/api/health > /dev/null 2>&1; do
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo >&2 "ERROR: Grafana failed to start within ${TIMEOUT} seconds"
    echo >&2 "Check logs with: docker logs \$(docker ps --filter 'name=grafana' --format '{{.ID}}')"
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo >&2 ""
echo >&2 "======================================"
echo >&2 "Logging stack is ready!"
echo >&2 "======================================"
echo >&2 ""
echo >&2 "Grafana UI: http://localhost:3200"
echo >&2 "  Username: admin"
echo >&2 "  Password: admin"
echo >&2 ""
echo >&2 "Loki API: http://localhost:3100"
echo >&2 ""
echo >&2 "To view logs:"
echo >&2 "  1. Open http://localhost:3200"
echo >&2 "  2. Navigate to Explore (compass icon)"
echo >&2 "  3. Select 'Loki' data source"
echo >&2 "  4. Try query: {container_name=~\".*zero2prod-axum.*\"}"
echo >&2 ""
