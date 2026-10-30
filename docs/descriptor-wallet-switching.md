# Descriptor wallet switching

Bitboard stores many **descriptor wallets** per Bitboard wallet (`wallet_id`): one row per `(network, addressType, accountId)` triple in the encrypted `wallet_secrets` payload. At runtime **one** BDK wallet is loaded in the crypto WASM worker at a time.

The Arkade bumper is BIP84 account 0 — the same HD account as the SegWit-0 row. Arkade hydrates that row on session open. When SegWit-0 is the loaded crypto wallet, crypto is the only writer of that changeset. When Taproot (or any other triple) is loaded, Arkade may persist SegWit-0 after a bumper wallet-wide sync (`createDescriptorWalletRowIfMissing` / `create_wallet_without_activating` so the crypto slot is not replaced). Dual in-memory BDKs remain until [crypto-owned descriptor spends](future/crypto-owned-descriptor-spends.md).

Switching network or address type in Settings means: persist the outgoing descriptor wallet’s BDK **changeset**, load the target descriptor wallet into WASM, update session/UI state, and (on live networks) refresh the dashboard from BDK and sync with Esplora.

For how on-chain balance/history and stale indicators work after a switch, see [`onchain-bitboard-wallet-model.md`](onchain-bitboard-wallet-model.md).

For post-sync anchor+chain reconcile (why dashboard sync is not “just call `bdk_esplora::sync`”), see [`esplora-bdk-anchor-reconcile.md`](esplora-bdk-anchor-reconcile.md).

## Terminology

| Term | Meaning |
|------|---------|
| **Descriptor wallet** | One `(network, addressType, accountId)` slot: descriptors + `changeSet` + metadata in `DescriptorWalletData`. |
| **Committed triple** | Persisted preference in `walletStore` (`networkMode`, `addressType`, `accountId`). |
| **Loaded descriptor wallet** | `loadedDescriptorWallet` — the triple WASM was last loaded for; set together with commit after a successful `loadWallet`. |
| **Live network** | `regtest`, `signet`, `testnet`, or `mainnet` — Esplora-backed on-chain sync applies. |
| **Lab** | Local SQLite simulator; no Esplora, no `lastSuccessfulEsploraSyncAt`. |

## Entry points

Settings UI does not call the core switch function directly. It goes through a mutation hook and thin orchestrators:

```mermaid
flowchart LR
  subgraph ui [Settings UI]
    NS[NetworkSelector]
    AT[AddressTypeSelector]
  end
  subgraph hooks [Hooks]
    M[useDescriptorWalletSwitchMutation]
  end
  subgraph orchestration [Orchestration]
    NET[executeSettingsNetworkSwitch]
    ADDR[executeSettingsAddressTypeSwitch]
    LAB[switchToLabNetwork]
  end
  subgraph core [Core]
    SW[switchDescriptorWallet]
  end

  NS --> M
  AT --> M
  M -->|network| NET
  M -->|addressType| ADDR
  NET -->|live ↔ live or lab → live| SW
  NET -->|→ lab| LAB
  ADDR --> SW
```

**Locked wallet shortcut:** If `walletStatus` is not `unlocked` or `syncing`, network/address changes only update the persisted preference (`setNetworkMode` / `setAddressType`). WASM load and Esplora run on the next unlock.

## Live network switch (unlocked session)

When the user picks a **live** target network while already unlocked (including **lab → live**), the app runs `switchDescriptorWallet` in [`settings-switch-wallet.ts`](../frontend/src/lib/wallet/settings-switch-wallet.ts).

### Phase diagram

```mermaid
flowchart TB
  START([User selects live network]) --> SAVE[1. Save outgoing wallet]
  SAVE --> CLEAR[2. Clear dashboard UI state]
  CLEAR --> LOAD[3. Load target descriptor wallet]
  LOAD --> COMMIT[4. Commit loaded triple + receive address]
  COMMIT --> BDK[5. refreshWalletStoreFromLoadedBdk]
  BDK --> INV[6. invalidateOnchainDashboardQueries]
  INV --> SYNC[7. syncLoadedDescriptorWalletWithEsplora]
  SYNC --> DONE([walletStatus = unlocked])

  SAVE -->|exportChangeset + updateDescriptorWalletChangeset| PERSIST[(Encrypted payload)]
  LOAD -->|resolveDescriptorWallet + loadWallet| WASM[(Crypto WASM worker)]
  SYNC -->|syncActiveWalletAndUpdateState| ESPLORA[Esplora]
  SYNC -->|changeset / timestamp persist| PERSIST
```

### Step-by-step

1. **Save outgoing descriptor wallet**  
   Awaits on-chain load/sync/save quiescence, then exports via `exportChangesetForPersistence` (blocked during in-flight lifecycle and while `syncPhase === 'sync-error'`) and persists under the **current** `(network, addressType, accountId)` via `updateDescriptorWalletChangeset`. **Skipped** when `sync-error` — last good persisted outgoing state is preserved. Skipped safely if WASM has no wallet yet (`isBenignNoActiveWalletError`). Load runs under `withWalletWriterLock`.

2. **Clear dashboard UI state**  
   Set `currentAddress`, `balance`, `transactions`, and `lastSyncTime` to empty/null so the UI never shows the previous network’s totals during load.

3. **Load target descriptor wallet**  
   - `resolveDescriptorWallet` — decrypt payload (workers only), find or lazily create the target row.  
   - `loadWalletHandlingPersistedChainMismatch` — `loadWallet` with persisted `changeSet`; on network/changeset mismatch, retry with an empty chain (`usedEmptyChainFallback`).

4. **Commit session state**  
   `getCurrentAddress` → `commitLoadedDescriptorWallet` updates `networkMode`, `addressType`, `accountId`, and `loadedDescriptorWallet`.

5. **Hydrate dashboard from BDK (before Esplora)**  
   `refreshWalletStoreFromLoadedBdk` reads `getBalance` / `getTransactionList` from WASM into `walletStore`.  
   `invalidateOnchainDashboardQueries` refetches per-descriptor-wallet Esplora metadata (`lastSuccessfulEsploraSyncAt`) for stale banners.

6. **Esplora sync**  
   `walletStatus` → `syncing`, then `syncLoadedDescriptorWalletWithEsplora`:
   - Runs `syncActiveWalletAndUpdateState` (incremental or full scan).
   - On success: `setLastSyncTime`, persist `lastSuccessfulEsploraSyncAt`, and on full scan also persist changeset + `fullScanDone`.
   - On failure: toast, `refreshWalletStoreFromLoadedBdk` again (keep BDK-local view), return `syncFailed` — **does not reject** the switch; user can retry via dashboard Sync.

7. **Finish**  
   Always `walletStatus` → `unlocked` so Sync remains usable after a failed Esplora step.

### When is a full Esplora scan used?

`fullScanNeeded` is true if any of:

- Target descriptor wallet has `fullScanDone === false`.
- Persisted changeset could not be loaded and an empty chain was used (`usedEmptyChainFallback`).

Live ↔ live network switches use incremental Esplora when the target row already has `fullScanDone`.

Defined in `switchDescriptorWallet`; executed inside `syncLoadedDescriptorWalletWithEsplora`.

### Live ↔ live routing

[`network-mode-switch.ts`](../frontend/src/lib/settings/network-mode-switch.ts) dispatches:

| From | To | Behavior |
|------|-----|----------|
| Live | Live | `switchDescriptorWallet` (if unlocked) |
| Live | Lab | `switchToLabNetwork` (see Lab section) |
| Lab | Live | `switchDescriptorWallet` + `terminateLabWorker` |
| Any | Same | no-op |

## Address type switch

Same core function, different UX copy. [`execute-settings-address-type-switch.ts`](../frontend/src/lib/settings/execute-settings-address-type-switch.ts) calls `switchDescriptorWallet` with `phaseContext: 'addressType'`: network and account stay fixed; only `addressType` changes.

Esplora and BDK hydration behave like a live network switch (unless the committed network is lab — address type switches on lab still go through `switchDescriptorWallet`, but the target branch skips Esplora when `targetNetworkMode === 'lab'`).

## Lab mode (simplified path)

Lab does not use Esplora, BDK dashboard hydration for stale UX, or `lastSuccessfulEsploraSyncAt`. On-chain activity on the lab dashboard comes from the **lab SQLite DB**, not the loaded BDK wallet’s tx graph.

### Switching **to** lab

[`switch-to-lab-network.ts`](../frontend/src/lib/lab/switch-to-lab-network.ts):

```mermaid
flowchart TB
  START([User selects Lab]) --> TERM[terminateLabWorker]
  TERM --> UNLOCK{Unlocked or syncing?}
  UNLOCK -->|no| PREF[setNetworkMode lab only]
  UNLOCK -->|yes| SAVE[Save live changeset to payload]
  SAVE --> LOAD[loadDescriptorWalletWithoutSync lab]
  LOAD --> PREF2[commitLoadedDescriptorWallet via load helper]
  PREF --> WARM[prefetchLabChainState]
  PREF2 --> WARM
  WARM --> DONE([Done])
```

- **Save (optional):** Same export + `updateDescriptorWalletChangeset` for the **previous live** network before leaving it.
- **Load:** `loadDescriptorWalletWithoutSync` — resolve + `loadWallet`, commit triple, **no** `refreshWalletStoreFromLoadedBdk`, **no** Esplora.
- **Warm:** Prefetch lab chain state for React Query.
- **Locked:** Only persisted `networkMode` → `lab`; WASM load happens on unlock.

### Switching **from** lab to live

Uses the full live `switchDescriptorWallet` path (save/load/sync/Esplora), then `terminateLabWorker` in `afterDescriptorSwitch`.

### What lab skips (compared to live)

| Step | Live switch | Lab switch |
|------|-------------|------------|
| Persist outgoing changeset | Yes (if WASM active) | Yes, when leaving live for lab |
| `loadWallet` target | Yes | Yes (lab network in WASM) |
| `refreshWalletStoreFromLoadedBdk` | Yes | No |
| `invalidateOnchainDashboardQueries` | Yes | No |
| `syncLoadedDescriptorWalletWithEsplora` | Yes | No |
| `lastSuccessfulEsploraSyncAt` write | On Esplora success | Never |
| Lab worker / SQLite chain | No | Yes (activity UI) |

## Related: unlock (not Settings switch)

First load after password entry uses [`orchestrateBootstrapUnlock` / `orchestrateManualUnlock`](../frontend/src/lib/wallet/lifecycle/lock-lifecycle-orchestrator.ts) (`runUnlockLoad`). It mirrors the live switch **load + BDK hydrate + background Esplora** pattern but is a separate entry point. Post-unlock Esplora is **incremental** when the hydrated descriptor has `fullScanDone` and load did not fall back to an empty chain; it full-scans only when `!fullScanDone` or `usedEmptyChainFallback`. Unlike Settings live↔live switch, unlock does **not** force a full scan merely because the network is live. Documented here because it shares helpers with switching:

- `resolveDescriptorWallet`
- `loadWalletHandlingPersistedChainMismatch` / `withPersistedChainMismatchRetry`
- `refreshWalletStoreFromLoadedBdk`
- `syncActiveWalletAndUpdateState` / changeset persist

## Signet and Mutinynet share a genesis block

Public Signet and Mutinynet both use the signet genesis block and both map to BDK `Network::Signet`. Their descriptors are identical (coin type 1), so BDK cannot tell their histories apart, and a changeset from one network can load under the other label without any error. The app tells them apart by **block height**: Mutinynet is far above `SIGNET_MUTINYNET_HEIGHT_BOUNDARY` (`1_000_000`), public Signet far below. The constant is defined twice, once per language, and each definition names the other location:

- TypeScript: [`signet-mutinynet-chain-classifier.ts`](../frontend/src/lib/wallet/signet-mutinynet-chain-classifier.ts)
- Rust: [`esplora_network_identity.rs`](../crypto/src/esplora_network_identity.rs)

### Chain repair migration (`signet-mutinynet-chain-repair`)

v0.3.6 split Signet from Mutinynet and relabeled descriptor rows. Rows could end up holding the other network's chain, and later syncs mixed both chains in one changeset, which left every transaction pending. The wallet data migration `signet-mutinynet-chain-repair` runs once per wallet on unlock, after `signet-network-split`:

- It reads `local_chain.blocks` and `tx_graph.anchors` from each `signet` / `mutinynet` descriptor row's changeset. The highest non-null local block is the tip, and each anchor height counts on its own. A tip of 0 (genesis only) counts for nothing.
- A row **contradicts** its label if any of those heights falls on the other side of the boundary. Rows that cannot be read are **unknown** and never contradict.
- Contradicting rows are **dropped**. Nothing is moved or swapped between labels, and the network selector is not changed.
- Other networks, Arkade accounts, and Lightning connections are not touched.

A dropped row is recreated on demand by `findOrCreateDescriptorWalletRow` with `fullScanDone: false`, so the next unlock or switch onto that network runs a full Esplora scan and rebuilds the history from the descriptors. No funds or keys are lost, because descriptors are derived from the wallet secrets, not stored only in the row.

### Sync guards in crypto

Two checks keep the wrong chain out of a changeset going forward. Both run in the crypto WASM before BDK applies an Esplora update:

| Guard | Where | Error code | Frontend handling |
|-------|-------|------------|-------------------|
| **Esplora network identity**: the update's tip height must be on the loaded network's side of the boundary (only for `signet` / `mutinynet`). | `sync_wallet` / `full_scan_wallet` via `sync::apply_esplora_update` | `esplora_network_mismatch` | "Wrong Esplora network" toast that points at the Esplora URL in Settings. No Full rescan, because the server is wrong, not the local chain. |
| **Fork at genesis**: a wallet with confirmed transactions must keep at least one saved checkpoint above genesis after the update. BDK `CannotConnectError` uses the same code. | `sync::apply_update` (also covers the anchor reconcile pass) | `esplora_chain_mismatch` | Treated as bad local chain state: Full rescan reloads the wallet with an empty chain once and scans again. |

A one-block reorg of the newest anchor is still accepted, because the older saved checkpoints remain. A sparse local chain whose only non-genesis block is reorged is rejected and is recovered with Full rescan.

## File map

| Role | File |
|------|------|
| Settings UI — network | [`NetworkSelector.tsx`](../frontend/src/components/settings/NetworkSelector.tsx) |
| Settings UI — address type | [`AddressTypeSelector.tsx`](../frontend/src/components/settings/AddressTypeSelector.tsx) |
| Switch mutation + status lines | [`useDescriptorWalletSwitchMutation.ts`](../frontend/src/hooks/useDescriptorWalletSwitchMutation.ts) |
| Network routing (lab ↔ live) | [`network-mode-switch.ts`](../frontend/src/lib/settings/network-mode-switch.ts) |
| Address type routing | [`execute-settings-address-type-switch.ts`](../frontend/src/lib/settings/execute-settings-address-type-switch.ts) |
| Phase/status copy | [`network-switch-status-messages.ts`](../frontend/src/lib/settings/network-switch-status-messages.ts) |
| **Core switch orchestration** | [`settings-switch-wallet.ts`](../frontend/src/lib/wallet/settings-switch-wallet.ts) |
| Switch **to** lab | [`switch-to-lab-network.ts`](../frontend/src/lib/lab/switch-to-lab-network.ts) |
| Esplora sync after load | [`wallet-utils.ts`](../frontend/src/lib/wallet/wallet-utils.ts) — `syncLoadedDescriptorWalletWithEsplora`, `syncActiveWalletAndUpdateState`, `loadWalletHandlingPersistedChainMismatch`, `loadDescriptorWalletWithoutSync`, `loadDescriptorWalletAndSync` |
| Payload find/create/update | [`descriptor-wallet-manager.ts`](../frontend/src/lib/wallet/descriptor-wallet-manager.ts) |
| BDK → dashboard store | [`onchain-bdk-store-sync.ts`](../frontend/src/lib/wallet/onchain-bdk-store-sync.ts) |
| Stale banner query invalidation | [`onchain-dashboard-sync.ts`](../frontend/src/lib/wallet/onchain-dashboard-sync.ts) |
| Esplora timestamp persist | [`onchain-esplora-sync-metadata.ts`](../frontend/src/lib/wallet/onchain-esplora-sync-metadata.ts) |
| Session triple + status | [`walletStore.ts`](../frontend/src/stores/walletStore.ts) |
| WASM load/sync/export | [`cryptoStore.ts`](../frontend/src/stores/cryptoStore.ts) + crypto worker |
| Encrypted payload CAS | [`wallet-persistence.ts`](../frontend/src/db/wallet-persistence.ts) |
| Unlock bootstrap query | [`useActiveWalletLoadQuery.ts`](../frontend/src/hooks/useActiveWalletLoadQuery.ts) |
| Signet / Mutinynet changeset classifier | [`signet-mutinynet-chain-classifier.ts`](../frontend/src/lib/wallet/signet-mutinynet-chain-classifier.ts) |
| Signet / Mutinynet repair migration | [`signet-network-split-migration.ts`](../frontend/src/lib/wallet/signet-network-split-migration.ts) — `dropDescriptorWalletsContradictingTheirNetwork` |
| Esplora network identity check | [`esplora_network_identity.rs`](../crypto/src/esplora_network_identity.rs) |
| Fork-at-genesis guard | [`sync.rs`](../crypto/src/sync.rs) — `apply_update` |

## Error contracts (live switch)

- **Load phase fails** (resolve, decrypt, `loadWallet`): `switchDescriptorWallet` rejects; toast; caller must **not** treat the new network as committed (orchestrators rely on commit happening only after successful load inside the same function).
- **Esplora phase fails** after successful load: function **resolves**; `walletStatus` returns to `unlocked`; BDK-local balance/txs remain; stale banner may show using persisted `lastSuccessfulEsploraSyncAt`.
- **Esplora serves another network** (`esplora_network_mismatch`): same as an Esplora phase failure. The update is not applied, the changeset stays unchanged, and the toast points at the Esplora URL in Settings.

See also [`doc/SECURITY.md`](../doc/SECURITY.md) for how decrypted payload scope relates to descriptor wallets at rest.
