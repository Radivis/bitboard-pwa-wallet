#!/bin/bash
# Reminder to run coverage refresh manually (avoids async/blocking issues in Lefthook)

cat << 'EOF'

════════════════════════════════════════════════════════════════
  💡 Coverage Reminder
════════════════════════════════════════════════════════════════

Coverage is not refreshed automatically via git hooks.
Run it manually to keep lcov.info and reports up to date:

  ./scripts/refresh-coverage.sh

This runs: Rust (cargo llvm-cov) + frontend (npm run test:coverage).

════════════════════════════════════════════════════════════════

EOF
