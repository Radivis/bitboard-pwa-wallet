# Arkade session start must not wait on scans

Defect 2 is fixed on this branch: session start publishes the persisted envelope and marks the rail `loaded` before any Esplora boarding scan. The live balance and history refresh runs with post-load sync. A scan error is a sync warning.

Defect 1 is still open. The address-UTXO cache on this branch only touches that cost.

The 30-second start budget is for opening the session. It is the wrong place to catch Esplora or the operator indexer up to the chain.

Related:

- Load race: `raceSessionStart` in `frontend/src/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator.ts`
- Deadline: `SESSION_START_TIMEOUT_MS` in `frontend/src/lib/wallet/lifecycle/session-start-timeout.ts`
- Envelope publish: `publishArkadeDashboardFromPersistedEnvelope` in `frontend/src/lib/arkade/arkade-persistence-store-sync.ts`
- Live refresh: `refreshArkadeStoreFromLoadedWasm`, called from post-load sync
- Envelope read: `ArkadeSession::persisted_dashboard` in `bitboard-arkade/src/session/balance.rs`
- Balance, including the boarding scan: `ArkadeSession::balance` in `bitboard-arkade/src/session/balance.rs`
- Envelope: [Arkade persistence](../persistence/arkade.md)
- Load contract: [wallet rail lifecycle](../wallet-rail-lifecycle.md#arkade-rail)
- Operator-indexer cost, a different path: [Arkade operator sync performance](./arkade-sync-performance-optimizations.md)

---

## Intended order

1. Open the WASM session from `sdkPersistenceJson`, then connect to the operator (or use `cached_operator_info` when autonomous mode is on).
2. Mark the rail `loaded` and show that persisted envelope.
3. After `loaded`, refresh from the operator and from Esplora. Slowness or failure of that refresh is a sync warning. It leaves the session open and leaves the worker running.

`orchestrateArkadePostLoadSync` runs after `loadPhase: 'loaded'` and does not sit inside the 30-second race. The live dashboard read runs there.

## What the envelope can already show

| Persisted | Available before any scan |
|-----------|---------------------------|
| Offchain VTXO list and balance buckets | Yes. `OffchainVtxoSnapshot`. `balance()` uses it when it is present. |
| Boarding rows | Addresses, owner, exit delay. Another signer's address is dropped on load. |
| Boarding spendable / pending / expired sats | No. `boarding_status` computes them by listing every loaded address on Esplora. |
| Pending batch intents, operator identity | Yes. |

A returning wallet shows its offchain balance from the snapshot as soon as the session is open. Boarding amounts update when the post-load scan finishes.

---

## Defect 1 — scans that still run are wasteful

This is the cost of the live read. It now runs after `loaded`, so it no longer spends the session-start budget. It can still stall the first boarding amounts.

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

The cache stops repeated listings. The first listing now runs after `loaded`.

## Defect 2 — session start waits on those scans

Fixed. `loaded` is published from `persisted_dashboard` (`arkade_get_persisted_dashboard`). That read is synchronous: offchain snapshot, stored pending intents, local receive address, boarding sats at zero. The 30-second race covers session open and that publish. It does not cover `refreshArkadeStoreFromLoadedWasm`.

```
orchestrateArkadeLoad
  raceSessionStart                         // 30s, then terminate the worker
    runArkadeSessionOpenBody
      openFreshArkadeWorkerSession
      hydrateArkadeDashboardAfterSessionOpen
        publishArkadeDashboardFromPersistedEnvelope
  loadPhase = loaded
  orchestrateArkadePostLoadSync            // live balance + history; scan error is a warning
```

`ArkadeSession::balance` still awaits `boarding_status`. That call is the live refresh, after `loaded`.

---

## Work order

1. Done. Session start publishes the envelope and sets `activeArkadeAccountId` before `loaded`.
2. Done. The live balance and history refresh runs with post-load sync. A scan error is a sync warning on a `loaded` rail.
3. Still open. Shrink the live scan: one boarding pass, and cover `get_output_status` if history still repeats it. The window-check change in defect 1 stays.
