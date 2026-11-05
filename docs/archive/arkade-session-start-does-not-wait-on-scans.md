# Arkade session start must not wait on scans

Implemented. Session open publishes the persisted envelope inside the 30-second budget. The live operator and Esplora refresh runs with post-load sync. A failed scan is `sync-error` and leaves the session open. The address-UTXO cache only avoided a second listing; the live refresh now lists each boarding address once.

The 30-second start budget is for opening the session. It is the wrong place to catch Esplora or the operator indexer up to the chain. The sections below record the two defects before this change.

Related:

- Load race: `raceSessionStart` in `frontend/src/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator.ts`
- Deadline: `SESSION_START_TIMEOUT_MS` in `frontend/src/lib/wallet/lifecycle/session-start-timeout.ts`
- Blocking refresh: `hydrateArkadeDashboardAfterSessionOpen` in `frontend/src/lib/wallet/lifecycle/arkade-session-open-helpers.ts`
- Dashboard read: `refreshArkadeStoreFromLoadedWasm` in `frontend/src/lib/arkade/arkade-persistence-store-sync.ts`
- Balance, including the boarding scan: `ArkadeSession::balance` in `bitboard-arkade/src/session/balance.rs`
- Envelope: [Arkade persistence](../persistence/arkade.md)
- Load contract: [wallet rail lifecycle](../wallet-rail-lifecycle.md#arkade-rail)
- Operator-indexer cost, a different path: [Arkade operator sync performance](./arkade-sync-performance-optimizations.md)

---

## Intended order

1. Open the WASM session from `sdkPersistenceJson`, then connect to the operator (or use `cached_operator_info` when autonomous mode is on).
2. Mark the rail `loaded` and show that persisted envelope.
3. After `loaded`, refresh from the operator and from Esplora. Slowness or failure of that refresh is a sync warning. It leaves the session open and leaves the worker running.

`orchestrateArkadePostLoadSync` runs after `loadPhase: 'loaded'` and does not sit inside the 30-second race. The live dashboard read runs there too. Before this change it was awaited inside the race, before `loaded`.

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

This was the cost of the live read, and why that read blew the start budget while it sat inside the race.

Already on this branch:

| Change | What it saves |
|--------|----------------|
| Address UTXO and chain-tip cache, 8 seconds (`esplora_blockchain.rs`) | A second walk of the same boarding addresses within 8 seconds does not hit Esplora again. |
| History refresh runs after balance (`arkade-persistence-store-sync.ts`) | The history walk reuses that cache. Receive address still loads in parallel with balance; that request goes to the operator. |
| Cooperative-window check looks up the one commitment transaction (`boarding_outpoint_past_cooperative_window`) | A pending boarding intent no longer lists every boarding address. |
| Indexer `GET /v1/indexer/vtxos` split at 40 references (`fetch_all_vtxos`) | Restores the pre-0.12 split. Stops HTTP 431 on a long Mutinynet script list. That is the operator sync path. |

The live refresh now pays this once per dashboard read:

- One `find_outpoints` per current-signer boarding address.
- `reconcile_pending_batch_intents` still runs first. The window check is one transaction per pending outpoint.
- `get_output_status` runs once per UTXO from that same listing.
- The browser allows about six connections per host. A stalled `fetch` is retried. One pass over a long boarding list can still be slow. That slowness is a sync error, not a failed session start.

The address cache still skips a repeated listing within 8 seconds. It is not what keeps the first listing out of session start.

## Defect 2 — session start waited on those scans

A timeout on that path was `load-error`. `failArkadeSessionStart` terminated the worker and cleared the dashboard, including when the WASM session had already opened. The race no longer includes the scan. `openSession` itself still has the 30-second deadline.

```
orchestrateArkadeLoad
  raceSessionStart                         // 30s, then terminate the worker
    runArkadeSessionOpenBody
      openFreshArkadeWorkerSession         // session is open after this returns
      hydrateArkadeDashboardAfterSessionOpen
        publishArkadeDashboardFromOpenSession  // envelope only, no Esplora
  loadPhase = loaded
  orchestrateArkadePostLoadSync            // outside the race
    syncWithOperator
    refreshArkadeStoreFromLoadedWasm       // one boarding pass; failure is sync-error
```

`ArkadeSession::balance` still awaits `boarding_status` for callers that ask for a live balance. Session open uses `persisted_dashboard` instead, so offchain buckets from the snapshot do not wait on that scan.

---

## Work order

Done:

1. `publishArkadeDashboardFromOpenSession` runs before `loaded`. It reads the envelope: offchain snapshot, stored pending batch intents, local bumper balance, and `peek_offchain_address`. `activeArkadeAccountId` is set at that point. Boarding spendable and pending sats stay 0 until the scan.
2. `refreshArkadeStoreFromLoadedWasm` runs with post-load sync, including when operator sync throws. A scan error is `sync-error` on a `loaded` rail. The worker stays up.
3. That refresh uses `live_dashboard`: one boarding listing, then one `get_output_status` per UTXO. The window-check change in defect 1 stays.

The load steps are in [wallet rail lifecycle](../wallet-rail-lifecycle.md#arkade-rail).

- `frontend/src/lib/wallet/lifecycle/__tests__/arkade-load-lifecycle-orchestrator.test.ts`
- `frontend/src/lib/wallet/lifecycle/__tests__/arkade-session-open-helpers.test.ts`
