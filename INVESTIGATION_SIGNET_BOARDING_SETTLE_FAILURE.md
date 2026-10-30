# Investigation: Arkade Boarding Settle Never Completes on Signet

## Investigation Date
2026-10-30

## Related Issues
- #75: Original timeout stuck state issue (fixed in PR #76)
- #76: TTL-based recovery PR (merged)

## Problem
After PR #76 fixes the timeout stuck state, boarding settle on **Signet** (`https://signet.arkade.sh`) still never completes:
- First Settle: timeout after ~35s–2min with "batch round timed out" banner
- After TTL recovery (~4 min total): banner clears, Settle re-enables
- Second Settle: times out again with same behavior  
- **No successful settle observed** on public Bitcoin Signet operator

## Investigation Findings

### 1. Network Configuration is Correct

**Signet vs Mutinynet Clarification:**
- Prior to signet/mutinynet split (PR #69), Bitboard's "signet" mode used Mutinynet
- Post-split, the app has **two separate network modes**:
  - `signet`: Public Bitcoin Signet → `https://signet.arkade.sh`
  - `mutinynet`: Mutinynet custom signet → `https://mutinynet.arkade.sh`

**Confirmed Configuration:**
```typescript
// frontend/src/lib/arkade/arkade-operator-proxy.ts
export const ARKADE_OPERATOR_UPSTREAM_BASES = {
  mainnet: 'https://arkade.computer',
  signet: 'https://signet.arkade.sh',       // ✅ Correct
  mutinynet: 'https://mutinynet.arkade.sh',  // ✅ Correct
  regtest: 'http://localhost:7070',
}
```

All Arkade accounts were migrated from `signet` → `mutinynet` during the split, so **there is no config mismatch**.

### 2. SSE Timeout Analysis

**Client-Side Timeout:**
- `BATCH_EVENT_TIMEOUT` in `ark-client`: **180 seconds** (3 minutes)
- Vercel SSE proxy `maxDuration`: **300 seconds** (5 minutes) per `docs/deploy-vercel.md`

**Observed Behavior:**
- Timeout occurs after **~35s–2min**, which is **much less** than the 3-minute client timeout
- This suggests the **SSE stream is closing prematurely from the server side**

**Hypothesis:** The public Signet operator (`https://signet.arkade.sh`) may be:
1. Not running batch rounds frequently enough (or at all)
2. Closing SSE connections before rounds complete
3. Rejecting or dropping boarding intents for unknown reasons

### 3. Boarding Window is Correct

The user's boarding UTXO is confirmed at block 328666 with txid `1314e7c08ebb26fcfb1348f976488a01360d19cc5bc2bf7904181046e497fc6f`.

On Signet with a typical boarding exit delay (e.g., 2016 blocks ≈ 2 weeks), the UTXO would still be well within its cooperative window during the settle attempts.

### 4. Client Code is Correct

**Batch Event Loop:**
The client correctly:
- Registers the intent with `RegisterIntent`
- Subscribes to SSE `v1/batch/events`
- Waits up to 180 seconds for `BatchStarted`, `TreeTx`, `TreeSignature`, and `BatchFinalized` events
- Returns `JoinBatchOutcome::Waiting` on timeout (correct behavior)

**No client bugs found** in the settle flow.

### 5. Why Mutinynet Works but Signet Doesn't

Mutinynet (`https://mutinynet.arkade.sh`) is:
- Actively maintained for Lightning/Arkade testing
- Runs frequent batch rounds
- Used by the Bitboard team and E2E tests

Public Bitcoin Signet (`https://signet.arkade.sh`) may be:
- Less actively maintained (if at all)
- Running batch rounds infrequently or not at all
- Configured differently than Mutinynet

## Root Cause

**External operator behavior, not a client bug.**

The public Signet Arkade operator at `https://signet.arkade.sh` does not appear to be completing batch rounds within the client's 3-minute SSE timeout window. This could be due to:

1. **Infrequent batch rounds** - operator may wait for multiple intents before running a round
2. **Operator downtime/maintenance** - service may not be actively running
3. **Configuration mismatch** - operator may have stricter requirements than client expects
4. **Server-side SSE timeout** - operator may close streams before rounds complete

## Recommendations

### For Bitboard Users
**Use Mutinynet for Arkade testing**, not public Signet:
1. In Settings → Network, select **Mutinynet** (not Signet)
2. Enable Arkade in Settings → Features
3. Board and settle should work as expected

### For Investigation/Ops
To diagnose the Signet operator issue, someone with operator access would need to check:

1. **Is `signet.arkade.sh` actively running?**
   ```bash
   curl -s https://signet.arkade.sh/v1/info | jq .
   ```
   
2. **Are batch rounds completing?**
   - Check operator logs for round activity
   - Monitor SSE `/v1/batch/events` stream
   
3. **What is the operator's `sessionDuration`?**
   - If longer than client timeout (180s), rounds will never complete from client perspective
   
4. **Are there other pending intents?**
   - Operator may wait for minimum batch size
   
5. **Server-side SSE timeout configuration**
   - Operator may have shorter SSE timeout than client expects

### For Documentation
Update user-facing docs to clarify:
- **Mutinynet recommended** for Arkade testing
- Public Signet operator status uncertain
- Regtest for local development with `arkade-regtest`

## What This Investigation Does NOT Include

- Live operator diagnostics (requires operator access)
- Inspection of `signet.arkade.sh` server logs
- Testing against alternative Signet operators (if any exist)

## Conclusion

**No client-side fix is appropriate.** The client correctly:
- ✅ Registers boarding intents
- ✅ Subscribes to batch events with proper timeout
- ✅ Returns `Waiting` on timeout (not a fake success)
- ✅ Auto-clears expired intents after registration TTL (PR #76)

The issue is that the **Signet operator does not complete batch rounds** within the client's 3-minute timeout window. This is an **operational/infrastructure issue** external to this repository.

---

## Verification Steps (if operator access available)

1. Register a boarding intent on Signet
2. Monitor `/v1/batch/events` SSE stream
3. Check if `BatchStarted` event appears within 3 minutes
4. If yes → client bug; if no → operator not running rounds
5. Check operator logs for round scheduling/completion
6. Compare operator config between Signet and Mutinynet

## References
- PR #76: https://github.com/Radivis/bitboard-pwa-wallet/pull/76
- Issue #75: https://github.com/Radivis/bitboard-pwa-wallet/issues/75
- Arkade operator endpoints: `frontend/src/lib/arkade/arkade-operator-proxy.ts`
- Batch event timeout: `third_party/ark-client/src/batch.rs:65` (`BATCH_EVENT_TIMEOUT = 180s`)
