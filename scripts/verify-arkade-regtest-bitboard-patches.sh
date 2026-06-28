#!/bin/bash
# Re-apply Bitboard-specific patches to the arkade-regtest submodule after
# `git submodule update`. Safe to run multiple times (idempotent checks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGTEST="$ROOT/regtest"

if [[ ! -d "$REGTEST/lib" ]]; then
  echo "ERROR: regtest submodule not found at $REGTEST"
  exit 1
fi

if ! grep -q 'PARENT_OVERRIDE' "$REGTEST/lib/compose.mjs" 2>/dev/null; then
  echo "ERROR: compose.mjs missing Bitboard PARENT_OVERRIDE patch — re-apply manually or update submodule commit."
  exit 1
fi

if [[ ! -f "$ROOT/docker/arkade-regtest.override.yml" ]]; then
  echo "ERROR: missing $ROOT/docker/arkade-regtest.override.yml"
  exit 1
fi

echo "arkade-regtest Bitboard patches present (compose override + container prefix)."
