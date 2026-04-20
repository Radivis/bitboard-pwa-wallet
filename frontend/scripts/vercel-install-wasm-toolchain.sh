#!/usr/bin/env bash
# Installs Rust (wasm32) and wasm-pack on Vercel builders — they do not include these by default.
# Idempotent so repeat deploys are faster when ~/.cargo is cached.
set -euo pipefail

export PATH="${HOME}/.cargo/bin:${PATH}"

if ! command -v rustc >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi

# shellcheck source=/dev/null
source "${HOME}/.cargo/env"

rustup target add wasm32-unknown-unknown

if ! command -v wasm-pack >/dev/null 2>&1; then
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

wasm-pack --version
