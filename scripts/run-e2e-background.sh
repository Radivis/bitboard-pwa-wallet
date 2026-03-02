#!/bin/bash
# Run E2E tests in background after commit
# Provides desktop notifications on completion

# Get script directory and change to frontend
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

cd "$FRONTEND_DIR" || {
    echo "Error: Cannot find frontend directory at $FRONTEND_DIR"
    exit 1
}

# Create unique files for this test run
LOG_FILE="/tmp/e2e-tests-$(date +%s).log"
STATUS_FILE="/tmp/e2e-tests-status-$(date +%s)"

# Show immediate feedback
echo "🧪 Starting E2E tests in background..."
echo "   Log file: $LOG_FILE"
echo "   Results will be shown via desktop notification"

# Export variables so the subshell can access them
export LOG_FILE STATUS_FILE FRONTEND_DIR

# Ensure PATH includes Node.js (handle NVM installations)
if [ -d "$HOME/.nvm" ]; then
    NODE_VERSION=$(ls -t "$HOME/.nvm/versions/node" 2>/dev/null | head -1)
    if [ -n "$NODE_VERSION" ]; then
        export PATH="$HOME/.nvm/versions/node/$NODE_VERSION/bin:$PATH"
    fi
fi

nohup bash -c '
    cd "$FRONTEND_DIR" || exit 1
    
    echo "════════════════════════════════════════════════════" > "$LOG_FILE"
    echo "  🧪 E2E TESTS STARTED at $(date)" >> "$LOG_FILE"
    echo "════════════════════════════════════════════════════" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    if npx playwright test --reporter=list >> "$LOG_FILE" 2>&1; then
        echo "" >> "$LOG_FILE"
        echo "════════════════════════════════════════════════════" >> "$LOG_FILE"
        echo "  ✅ E2E TESTS PASSED at $(date)" >> "$LOG_FILE"
        echo "════════════════════════════════════════════════════" >> "$LOG_FILE"
        echo "PASSED" > "$STATUS_FILE"
        
        # Send success notification
        if command -v notify-send &> /dev/null; then
            DISPLAY=:0 notify-send "✅ E2E Tests" "All tests passed!" -u low
        fi
    else
        EXIT_CODE=$?
        echo "" >> "$LOG_FILE"
        echo "════════════════════════════════════════════════════" >> "$LOG_FILE"
        echo "  ❌ E2E TESTS FAILED at $(date) (exit code: $EXIT_CODE)" >> "$LOG_FILE"
        echo "════════════════════════════════════════════════════" >> "$LOG_FILE"
        echo "FAILED:$EXIT_CODE" > "$STATUS_FILE"
        
        # Send failure notification
        if command -v notify-send &> /dev/null; then
            DISPLAY=:0 notify-send "❌ E2E Tests Failed" "Opening Playwright report" -u critical
        fi
        
        # Open report
        DISPLAY=:0 xdg-open "$FRONTEND_DIR/playwright-report/index.html" 2>/dev/null || \
        open "$FRONTEND_DIR/playwright-report/index.html" 2>/dev/null || true
    fi
    
    # Clean up status file
    sleep 2
    rm -f "$STATUS_FILE"
' > /dev/null 2>&1 &

echo "✓ E2E tests launched"
echo ""
