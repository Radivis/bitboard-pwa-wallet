#!/bin/bash
# Reminder to run E2E tests manually

cat << 'EOF'

════════════════════════════════════════════════════════════════
  💡 E2E Test Reminder
════════════════════════════════════════════════════════════════

E2E tests are not run automatically via git hooks.
Please run them manually frequently to catch issues early.

Options:

  1. Foreground (blocking):
     cd frontend && npx playwright test

  2. Background (non-blocking, with desktop notifications):
     ./scripts/run-e2e-background.sh

Note: Full E2E tests always run in CI before merge.

════════════════════════════════════════════════════════════════

EOF
