#!/usr/bin/env bash
# Refresh coverage reports (Rust + frontend) for local development.
# Run from repository root. Used as last step in post-commit hook.

set -e
cd "$(dirname "$0")/.."

echo "Refreshing coverage reports..."

echo "[1/3] Rust: generating lcov and HTML..."
cargo llvm-cov --workspace --lcov --output-path lcov.info
cargo llvm-cov report --html --output-dir coverage

echo "[2/3] Frontend: running test:coverage..."
(cd frontend && npm run test:coverage)

echo "[3/3] Done. Rust: lcov.info + coverage/ ; Frontend: frontend/coverage/"
