# Fix Summary: Collaborative Exit INTENT_INSUFFICIENT_FEE (#84)

## PR
- **Branch**: `cursor/fix-collaborative-exit-fee-expiry-5172`
- **PR**: https://github.com/Radivis/bitboard-pwa-wallet/pull/85
- **Base**: `v0.3.7`
- **Status**: Ready for review

## Problem Statement

After ark-client 0.9.3→0.12.0 upgrade, collaborative exit of 2000 sats failed with:
```
INTENT_INSUFFICIENT_FEE (31): got 0 min expected 32
```

**Symptoms**:
- UI showed: Estimated operator fee **0**, Settlement fee rate **0**
- Boarding on same commit worked fine
- Pre-0.12 version (PR #81) had working fees (~12-20 sats)

## Root Cause Analysis

### Timeline
1. **PR #81** (commit 1557e28d) - Fixed similar issue pre-0.12.0
   - Added `estimate_offboard_intent_fee_via_operator()` 
   - Queried operator's `/v1/intent/estimate` endpoint
   - Workaround for stale/empty local fee estimator

2. **0.12.0 Upgrade** (commit 74e40046)
   - Introduced `plan_offboard_settlement` (multi-quote negotiation)
   - Removed PR #81's operator query approach
   - Broke VTXO expiry propagation

### The Bug

In `third_party/ark-client/src/batch.rs:520` (pre-fix):
```rust
let offchain_inputs: Vec<ark_fees::OffchainInput> = vtxo_inputs
    .iter()
    .map(|input| ark_fees::OffchainInput {
        amount: input.amount().to_sat(),
        expiry: None,  // ❌ HARDCODED NONE
        birth: None,
        input_type: ark_fees::VtxoType::Vtxo,
        weight: 1.0,
    })
    .collect();
```

Mutinynet's intent fee CEL expression:
```cel
expiry - now() > 518656.0 ? amount * 0.002 : 0.0
```

When `expiry: None`, CEL uses 0 as default → time check fails → fee = 0 → operator rejects with INTENT_INSUFFICIENT_FEE.

## Solution

Propagate VTXO expiry from source to fee calculation:

### Changes

1. **`fetch_commitment_transaction_inputs`** (batch.rs:1323)
   - **Before**: Returns `(Vec<OnChainInput>, Vec<Input>, Amount)`
   - **After**: Returns `(Vec<OnChainInput>, Vec<Input>, Amount, HashMap<OutPoint, i64>)`
   - Captures `entry.vtxo().expires_at` at line 1410-1415

2. **`eval_intent_fee`** (batch.rs:505)
   - **Before**: `expiry: None`
   - **After**: `expiry: vtxo_expiries.get(&input.outpoint()).copied()`

3. **Function signatures updated**:
   - `eval_offboard_intent_fee` - added `vtxo_expiries` parameter
   - `eval_board_intent_fee` - added `vtxo_expiries` parameter
   - `board_to_amount_after_intent_fee` - added `vtxo_expiries` parameter
   - `prepare_offboard_excluding_vtxos` - threads expiries, filters excluded

4. **All call sites updated** (15 locations):
   - `batch.rs`: 8 updates
   - `fee_estimation.rs`: 2 updates
   - `migration.rs`: 1 update

### Files Changed
- `third_party/ark-client/src/batch.rs` - Core fix
- `third_party/ark-client/src/fee_estimation.rs` - Call site updates
- `third_party/ark-client/src/migration.rs` - Call site update
- `bitboard-arkade/src/session/collaborative_exit.rs` - Documentation test

## Testing

### Existing Test Coverage
- ✅ `mutinynet_offchain_input_cel_is_zero_without_expiry` (lines 270-293)
  - Proves: Without expiry → fee = 0
  - Proves: With expiry (2000 sats) → fee = 4 sats (0.2%)

### New Test
- ✅ `expiry_propagation_tests` module
  - Documents the fix architecture
  - Points to integration verification requirement

### Verification Needed
🔄 **Manual Mutinynet smoke test** (or E2E arkade-regtest):
1. Board ≥2000 sats
2. Collaborative exit 2000 sats
3. **Expected**: Non-zero operator fee (~4 sats), intent succeeds
4. **Before fix**: Fee 0, RegisterIntent failed

## Technical Notes

### Breaking Change (Internal API)
- `fetch_commitment_transaction_inputs` signature changed
- Only affects `ark-client` internal callers (all updated in this PR)
- Not a public API break

### Why Not Use PR #81 Approach?

PR #81 queried operator's estimate endpoint, bypassing the local fee estimator entirely. The 0.12.0 architecture uses `plan_offboard_settlement` which requires a closure for fee quoting (called multiple times during negotiation). The operator query approach doesn't fit this pattern well. 

The expiry propagation fix is cleaner and more efficient:
- Works with the 0.12.0 architecture
- No extra RPC calls
- Fixes the root cause (missing expiry data) rather than working around it

### Relation to Issues #80 and #81

- **#80**: Original issue - operator fees returned 0
- **#81**: First fix - query operator endpoint (removed in 0.12.0)
- **#84**: Regression after 0.12.0 upgrade
- **This PR**: Proper fix compatible with 0.12.0 architecture

## Deployment

1. Merge PR #85 to v0.3.7
2. WASM rebuild required: `cd frontend && npm run build:wasm`
3. Hard-refresh browser or restart dev server (worker caches WASM)
4. Verify on Mutinynet with 2000 sat collaborative exit

## Success Criteria

- ✅ Code compiles
- ✅ Unit tests pass
- ✅ PR created against v0.3.7
- 🔄 Pending: Mutinynet smoke test showing non-zero fee
- 🔄 Pending: CI checks pass

## Commit
```
cb3bce31 - Fix collaborative exit INTENT_INSUFFICIENT_FEE by propagating VTXO expiry to fee estimation
```
