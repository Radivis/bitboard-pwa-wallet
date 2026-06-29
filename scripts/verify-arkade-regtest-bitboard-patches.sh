#!/bin/bash
# Apply Bitboard-specific patches to the arkade-regtest submodule after
# `git submodule update`. Safe to run multiple times (idempotent checks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGTEST="$ROOT/regtest"
PATCH="$ROOT/scripts/patches/arkade-regtest-bitboard.patch"

if [[ ! -d "$REGTEST/lib" ]]; then
  echo "ERROR: regtest submodule not found at $REGTEST"
  exit 1
fi

if [[ ! -f "$ROOT/docker/arkade-regtest.override.yml" ]]; then
  echo "ERROR: missing $ROOT/docker/arkade-regtest.override.yml"
  exit 1
fi

compose_has_parent_override() {
  grep -q 'PARENT_OVERRIDE' "$REGTEST/lib/compose.mjs" 2>/dev/null
}

if ! compose_has_parent_override; then
  if [[ ! -f "$PATCH" ]]; then
    echo "ERROR: missing Bitboard patch file at $PATCH"
    exit 1
  fi
  echo "Applying Bitboard patches to arkade-regtest submodule..."
  if ! (cd "$REGTEST" && git apply --check "$PATCH" 2>/dev/null); then
    echo "ERROR: Bitboard patch does not apply cleanly to regtest submodule."
    echo "       Update scripts/patches/arkade-regtest-bitboard.patch or bump the submodule commit."
    exit 1
  fi
  (cd "$REGTEST" && git apply "$PATCH")
fi

if ! compose_has_parent_override; then
  echo "ERROR: compose.mjs missing Bitboard PARENT_OVERRIDE patch after apply."
  exit 1
fi

echo "arkade-regtest Bitboard patches present (compose override + container prefix)."
