# Arkade operator sync: performance options

Planning note for accelerating **ASP / indexer sync** on wallets with a large VTXO history. Nothing here is implemented yet except the mitigations listed under [Already shipped](#already-shipped).

Unlock feeling like a full Esplora rescan (`/blocks`, scripthash `/txs`, 429s, double “Wallet synced”) is a **different** problem: [unlock-esplora-full-scan-instead-of-sync.md](./unlock-esplora-full-scan-instead-of-sync.md).

Related:

- Sync entry: `ArkSession::sync_with_operator` / `sync_with_operator_and_vtxo_list` in `bitboard-ark/src/session/sync.rs`
- Indexer fetch: `Client::fetch_all_vtxos` / `list_vtxos` in `third_party/ark-client/src/lib.rs`
- Request filters: `GetVtxosRequest` in `third_party/ark-core/src/server.rs`
- Background poll: `scheduleBackgroundArkadeOperatorSync` in `frontend/src/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator.ts`
- Poll interval: `ARKADE_BACKGROUND_OPERATOR_SYNC_MIN_INTERVAL_MS` (15s) in `frontend/src/lib/arkade/arkade-sync-timings.ts`
- Snapshot: `OffchainVtxoSnapshot` in `bitboard-ark/src/persistence.rs`
- Feature contract: [doc/features/arkade.yaml](../../doc/features/arkade.yaml)

---

## The problem

On a Mutinynet wallet with **hundreds of historical VTXOs**, every operator sync still downloads the **full unfiltered VTXO history** by querying **every cached receive script**.

Measured wallet (debug session, idle):

| Quantity | Typical value |
|----------|---------------|
| HD receive indices | ~185 |
| Scripts sent to the indexer (`get_offchain_addresses`: 2 address variants per key) | ~370 |
| VTXOs returned | ~345, almost all **spent** (~340–342) |
| Indexer GETs per full list | **10** (`MAX_GET_VTXOS_REFS_PER_REQUEST` = 40) |
| Idle full-list time after parallel chunks | **~2.5–4s** |
| Contended (overlapping dashboard sync + other ops) | **~7–12s** |
| Persistence JSON | ~1.0MB; encrypt/write ~350–430ms (not the list bottleneck) |

The cost is **script-count × HTTP RTT**, not local CPU over VTXO rows. Pagination is already 100/page; a typical chunk is **one page**. Browser HTTP/1.1 is ~6 connections per host, so 10 chunks cannot finish in one wave.

`spendable_only` shrinks the **response body** (2 vs 345 rows) but **not** the chunk count. A spendable-only scan of all 370 scripts is still ~10 GETs / ~3s.

`sync_with_operator` always calls `client.list_vtxos()` (unfiltered), then rebuilds `offchain_vtxo_snapshot` from that list. Dashboard polls do this at least every 15s while the tab is visible. Board / intent still await `persistAfterCriticalOperation` → another full sync. Intent “slowness” after register is mostly the Mutinynet **batch round** (~50–60s) and is **out of scope** here.

---

## Already shipped

These stay. They removed the worst user-visible stalls but **do not** change the full-history sync floor.

| Change | Effect |
|--------|--------|
| Parallel indexer chunks (`try_join_all` in `fetch_all_vtxos`) capped at 4 in-flight, with retries on browser `Failed to fetch` | Sequential ~8s list → ~2.5–4s; overlapping lists no longer starve the 6-connection host pool |
| Boarding address fetch flushes persistence only (no `persistAfterCriticalOperation` full list) | Opening Board no longer starts a second 10-GET indexer scan |
| Incremental `discover_keys` from `peek_next_derivation_index()` | 11 gap-20 batches / ~7s → 1 batch / ~0.2s when the cache is warm |
| Boarding-only settle skips VTXO list (`fetch_commitment_transaction_inputs_opt`) | Board input fetch ~7.6s → ~2.2s when `settleableVtxos=0` |
| `ArkSession::list_vtxos` reads the snapshot when present | VTXO list UI ~8.6s → tens of ms |
| Send coin-select from snapshot + no blocking post-send full sync | Send ~15s → ~3s (remaining time is the ASP offchain send) |
| `list_spendable_vtxos` / `list_vtxos_filtered` | Smaller payloads; send fallback only |

Exit-materials prefetch is not the slowness when materials are already cached.

---

## What “significantly faster” requires

A single idle sync will stay ~3s for as long as every sync enumerates **all ~370 scripts unfiltered**. Significant acceleration means **fewer scripts**, **fewer requests**, or **not doing a full history list on every sync**.

---

## Options

### 1. Incremental merge (highest leverage, no ASP change)

Treat the persisted snapshot as source of truth for **spent history**. Each sync only asks the ASP what can change:

| Query | Purpose | Size on the measured wallet |
|-------|---------|-----------------------------|
| `list_vtxos_for_outpoints` on snapshot **unspent** | Detect spends / flag changes | ~2–4 refs → **1 GET** |
| `spendable_only` on **unused gap + recent receive scripts** | Detect incoming VTXOs | ~40 scripts → **1 GET** |
| Optional `recoverable_only` / `pending_only` on the same refs | Recovery / preconfirmed | still 1–2 GETs |

**Merge:** upsert live spendable; mark snapshot-unspent missing from spendable as spent; **do not re-download** the ~340 spent rows.

**Expected idle list:** ~0.3–0.8s vs ~3s.

**Risks:** treating “not in spendable” as spent can miss recoverable / swept / preconfirmed. First open (empty snapshot) must still full-list. Keep a **periodic full reconcile** (interval, manual refresh, or after errors).

Indexer already supports `spendable_only`, `spent_only`, `recoverable_only`, `pending_only`, `with_after` / `with_before`, and outpoint references.

### 2. Do not use `after=` as the only delta

`with_after(timestamp)` is useful for **new** VTXOs, not for **spends of old ones**. A spend updates an existing outpoint and may not appear as “created after last sync.” Pair any time cursor with **outpoint refresh of previously unspent** (option 1).

### 3. Query fewer scripts (medium, complementary)

370 = 185 keys × 2 address variants.

- **Used scripts + unused gap only** — skip HD scripts that never appeared in the snapshot and sit below the unused gap. Incoming to a never-seen old index waits until a full reconcile.
- **Drop the unused address variant** if one of the two scripts per key never appears in history (measure first). ~185 refs → 5 chunks, roughly **half** the current full-scan floor (~1.5s). Still linear in used keys.
- **Raise `MAX_GET_VTXOS_REFS_PER_REQUEST` (40)** if Mutinynet does not return HTTP 431 at 60–80. Five chunks can finish in one browser connection wave. Measure 431 before relying on this.

None of these beat incremental merge once spent history is local.

### 4. Stop full-listing on every dashboard poll (product, cheap)

- Dashboard: **light sync** (option 1) or skip if the last sync is fresh.
- **Full history list** only on first open, manual refresh, and a rare reconcile.
- After board / intent: persist the **operation result** into the snapshot; do not re-pull hundreds of spent rows. Send already skips this.

Does not lower the cost of *one* full list; stops paying it several times a minute.

### 5. Coalesce in-flight `list_vtxos`

Overlapping syncs still stack 10-chunk waves. A client-level single-flight / mutex cuts **contention**, not the **~3s idle** full-list floor.

### 6. Subscribe instead of poll (larger change)

`ark-client` already has `subscribe_to_scripts` / `get_subscription` (`vtxo_watcher.rs`). Push of new/spent VTXOs could replace periodic full lists.

**Caveats:** WASM / browser streaming vs REST, reconnect and backfill, and a snapshot + outpoint refresh after gaps. Mutinynet reliability may not be enough to drop reconcile.

### 7. ASP / protocol (true step-change)

The tax is **script-count × RTT**, not page size. A wallet-scoped “changed since cursor” or “scripts for this xpub” API would collapse 10 GETs to 1. That is an ASP change, not Bitboard-only.

### 8. Prune stored history (product)

If the VTXO viewer / `offchain_history_from_snapshot` can drop old spent rows, a full list is no longer required for UI. Persistence (~1MB / ~400ms encrypt) shrinks too. This is a history-contract change.

---

## Recommended path

| Priority | Change | Idle sync on the measured wallet |
|----------|--------|----------------------------------|
| **Do** | Incremental merge (outpoints + gap spendable) + rare full reconcile | **~0.5s** vs **~3s** |
| **Do** | Light sync on the 15s poll; full list only on open / manual / interval | Fewer **3s** hits |
| **Do** | Skip full list in `persistAfterCriticalOperation` after board / intent | Same after those ops |
| **Measure** | Unused address variant + larger chunk size | Maybe **~1.5s** if still full-scanning |
| **Later** | Script subscription | Near-zero steady-state list |
| **Skip as sole fix** | `spendable_only` on all 370 scripts | Still **~10 GETs / ~3s** |

Implementation notes when this is picked up:

- First sync without a snapshot stays a full unfiltered list.
- Merge must preserve recoverable / pending / swept flags; do not equate “absent from spendable” with “spent” without an outpoint or recoverable check.
- WASM crates: rebuild with `npm run build:wasm` (or the `bitboard-ark` `wasm-pack` line) before browser verification; `npm run dev` does not rebuild WASM.
