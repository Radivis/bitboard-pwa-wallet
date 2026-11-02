# Arkade session start must not wait on scans

Open. Two separate defects. The address-UTXO cache on this branch only touches the first.

The 30-second start budget is for opening the session. It is the wrong place to catch Esplora or the operator indexer up to the chain.

Related:

- Load race: `raceSessionStart` in `frontend/src/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator.ts`
- Deadline: `SESSION_START_TIMEOUT_MS` in `frontend/src/lib/wallet/lifecycle/session-start-timeout.ts`
- Blocking refresh: `hydrateArkadeDashboardAfterSessionOpen` in `frontend/src/lib/wallet/lifecycle/arkade-session-open-helpers.ts`
- Dashboard read: `refreshArkadeStoreFromLoadedWasm` in `frontend/src/lib/arkade/arkade-persistence-store-sync.ts`
- Balance, including the boarding scan: `ArkadeSession::balance` in `bitboard-arkade/src/session/balance.rs`
- Envelope: [Arkade persistence](../persistence/arkade.md)
- Current load contract (still describes the blocking refresh): [wallet rail lifecycle](../wallet-rail-lifecycle.md#arkade-rail)
- Operator-indexer cost, a different path: [Arkade operator sync performance](./arkade-sync-performance-optimizations.md)

---

## Intended order

1. Open the WASM session from `sdkPersistenceJson`, then connect to the operator (or use `cached_operator_info` when autonomous mode is on).
2. Mark the rail `loaded` and show that persisted envelope.
3. After `loaded`, refresh from the operator and from Esplora. Slowness or failure of that refresh is a sync warning. It leaves the session open and leaves the worker running.

`orchestrateArkadePostLoadSync` already runs after `loadPhase: 'loaded'` and does not sit inside the 30-second race. The live dashboard read does not. It is awaited inside the race, before `loaded`.

## What the envelope can already show

| Persisted | Available before any scan |
|-----------|---------------------------|
| Offchain VTXO list and balance buckets | Yes. `OffchainVtxoSnapshot`. `balance()` uses it when it is present. |
| Boarding rows | Addresses, owner, exit delay. Another signer's address is dropped on load. |
| Boarding spendable / pending / expired sats | No. `boarding_status` computes them by listing every loaded address on Esplora. |
| Pending batch intents, operator identity | Yes. |

A returning wallet can show its offchain balance from the snapshot as soon as the session is open. Boarding amounts update when the post-load scan finishes. That scan stays on the dashboard. It moves out of session start.

v0.3.6 already walked the boarding addresses during start, and it had no deadline, so a slow walk still opened the wallet. v0.3.7 wrapped that walk in the 30-second race. A walk that used to finish now fails the session and terminates the worker.

---

## Defect 1 — scans that still run are wasteful

This is the cost of the live read. It matters once the read moves after `loaded`, and it is why the read currently blows the start budget.

Already on this branch:

| Change | What it saves |
|--------|----------------|
| Address UTXO and chain-tip cache, 8 seconds (`esplora_blockchain.rs`) | A second walk of the same boarding addresses within 8 seconds does not hit Esplora again. |
| History refresh runs after balance (`arkade-persistence-store-sync.ts`) | The history walk reuses that cache. Receive address still loads in parallel with balance; that request goes to the operator. |
| Cooperative-window check looks up the one commitment transaction (`boarding_outpoint_past_cooperative_window`) | A pending boarding intent no longer lists every boarding address. |
| Indexer `GET /v1/indexer/vtxos` split at 40 references (`fetch_all_vtxos`) | Restores the pre-0.12 split. Stops HTTP 431 on a long Mutinynet script list. That is the operator sync path. |

Still paid on every live balance plus history:

- `boarding_status` lists every current-signer boarding address (`find_outpoints`).
- That call first runs `reconcile_pending_batch_intents`. The window check is now one transaction per pending outpoint, and it is still on the network.
- History then calls `boarding_commitment_txids` and `boarding_history_transactions`. The address list can hit the 8-second cache. `get_output_status` per UTXO is a separate request and is not covered by that cache.
- The browser allows about six connections per host. A stalled `fetch` is retried. One pass over a long boarding list can still exceed 30 seconds.

The cache stops repeated listings. It does not remove the first listing from session start.

## Defect 2 — session start waits on those scans

A timeout here is `load-error`. `failArkadeSessionStart` terminates the worker and clears the dashboard, including when the WASM session had already opened.

```
orchestrateArkadeLoad
  raceSessionStart                         // 30s, then terminate the worker
    runArkadeSessionOpenBody
      openFreshArkadeWorkerSession         // session is open after this returns
      hydrateArkadeDashboardAfterSessionOpen
        refreshArkadeStoreFromLoadedWasm
          getBalance                       // boarding_status → Esplora
          getAddress                       // operator
          getTransactionHistory            // boarding walks again
  loadPhase = loaded                       // only if the refresh returned in time
  orchestrateArkadePostLoadSync            // already outside the race
```

`getBalance` is the call that reaches Esplora, because `ArkadeSession::balance` always awaits `boarding_status`. Offchain buckets from the snapshot do not need that await.

---

## Work order

1. Stop awaiting `refreshArkadeStoreFromLoadedWasm` before `loaded`. Publish the dashboard from the envelope: offchain snapshot, stored boarding rows, and a receive address when the open session can derive it locally. Set `activeArkadeAccountId` at that point.
2. Run the live balance and history refresh with the post-load sync, outside the 30-second race. A scan error is a sync warning on a `loaded` rail.
3. Then shrink the live scan: one boarding pass, and cover `get_output_status` if history still repeats it. The window-check change in defect 1 stays.

Tests and the load steps in [wallet rail lifecycle](../wallet-rail-lifecycle.md#arkade-rail) currently require the refresh before `loaded`. Update them with step 1.

- `frontend/src/lib/wallet/lifecycle/__tests__/arkade-load-lifecycle-orchestrator.test.ts`
- `frontend/src/lib/wallet/lifecycle/__tests__/arkade-session-open-helpers.test.ts`
