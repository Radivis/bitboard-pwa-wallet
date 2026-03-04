#!/bin/bash
CONTAINER_NAME="bitboard-regtest"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Regtest container already running."
  exit 0
fi

docker rm -f "$CONTAINER_NAME" 2>/dev/null

echo "Starting bitcoinerlab/tester regtest environment..."
docker run -d --name "$CONTAINER_NAME" \
  -p 8080:8080 -p 60401:60401 -p 3002:3002 -p 5000:5000 \
  bitcoinerlab/tester

echo "Waiting for Esplora API (port 3002)..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3002/blocks/tip/height > /dev/null 2>&1; then
    echo "Regtest environment ready."
    exit 0
  fi
  sleep 2
done

echo "ERROR: Esplora did not become ready within 60 seconds."
exit 1
