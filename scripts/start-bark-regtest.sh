#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CAPTAIND_TOML_REL="${BARK_CAPTAIND_TOML:-docker/captaind/captaind.toml}"
if [[ "$CAPTAIND_TOML_REL" = /* ]]; then
  export BARK_CAPTAIND_TOML="$CAPTAIND_TOML_REL"
else
  export BARK_CAPTAIND_TOML="$ROOT/$CAPTAIND_TOML_REL"
fi
if [[ ! -f "$BARK_CAPTAIND_TOML" ]]; then
  echo "captaind config not found: $BARK_CAPTAIND_TOML" >&2
  exit 1
fi

echo "Starting bark-regtest (profiles: base + ark + bark) with $BARK_CAPTAIND_TOML..."
bash "$ROOT/scripts/verify-arkade-regtest-bitboard-patches.sh"
node regtest/regtest.mjs start --profile bark

echo "Funding captaind round wallet and waiting for bark-regtest health..."
node "$ROOT/scripts/bark-regtest-health.mjs" --fund
echo "bark-regtest ready."
