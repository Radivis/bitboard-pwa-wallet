#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONFIG_DIRECTORY="$ROOT/docker/captaind"
CAPTAIND_TOML_REL="${BARK_CAPTAIND_TOML:-docker/captaind/captaind.toml}"
if [[ "$CAPTAIND_TOML_REL" = /* ]]; then
  CAPTAIND_TOML_PATH="$CAPTAIND_TOML_REL"
else
  CAPTAIND_TOML_PATH="$ROOT/$CAPTAIND_TOML_REL"
fi
if [[ ! -f "$CAPTAIND_TOML_PATH" ]]; then
  echo "captaind config not found: $CAPTAIND_TOML_PATH" >&2
  exit 1
fi

# Compose mounts CONFIG_DIRECTORY and the image reads CAPTAIND_CONFIG.
# Passing the whole file path as a bind source lets Docker replace a missing
# toml with a root-owned directory.
case "$CAPTAIND_TOML_PATH" in
  "$CONFIG_DIRECTORY"/*) ;;
  *)
    echo "captaind config must be a file in $CONFIG_DIRECTORY" >&2
    exit 1
    ;;
esac
BARK_CAPTAIND_CONFIG_FILE="${CAPTAIND_TOML_PATH#"$CONFIG_DIRECTORY"/}"
if [[ "$BARK_CAPTAIND_CONFIG_FILE" == */* || "$BARK_CAPTAIND_CONFIG_FILE" == "." || "$BARK_CAPTAIND_CONFIG_FILE" == ".." ]]; then
  echo "captaind config must be a single file in $CONFIG_DIRECTORY" >&2
  exit 1
fi
export BARK_CAPTAIND_CONFIG_FILE
unset BARK_CAPTAIND_TOML

echo "Starting bark-regtest (profiles: base + ark + bark) with $CONFIG_DIRECTORY/$BARK_CAPTAIND_CONFIG_FILE..."
bash "$ROOT/scripts/verify-arkade-regtest-bitboard-patches.sh"
node regtest/regtest.mjs start --profile bark

echo "Funding captaind round wallet and waiting for bark-regtest health..."
node "$ROOT/scripts/bark-regtest-health.mjs" --fund
echo "bark-regtest ready."
