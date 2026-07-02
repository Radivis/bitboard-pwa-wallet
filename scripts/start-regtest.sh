#!/bin/bash
# Backward-compatible entry point — delegates to arkade-regtest.
exec "$(cd "$(dirname "$0")" && pwd)/start-arkade-regtest.sh" "$@"
