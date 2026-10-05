#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Starting bark-regtest (profiles: base + ark + bark)..."
bash "$ROOT/scripts/verify-arkade-regtest-bitboard-patches.sh"
node regtest/regtest.mjs start --profile bark

echo "Funding captaind round wallet and waiting for bark-regtest health..."
node "$ROOT/scripts/bark-regtest-health.mjs" --fund
echo "bark-regtest ready."
