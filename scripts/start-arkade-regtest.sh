#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Starting arkade-regtest (profile: ark)..."
bash "$ROOT/scripts/verify-arkade-regtest-bitboard-patches.sh"
node regtest/regtest.mjs start --profile ark

echo "Waiting for arkade-regtest health (Esplora + arkd)..."
bash "$ROOT/scripts/wait-arkade-regtest-health.sh"
echo "arkade-regtest ready."
