# Arkade and Bitboard wallets

This document records how Bitboard scopes **Arkade (VTXO / offchain)** relative to **Bitboard wallets** (`wallet_id`) and **on-chain BDK** descriptor wallets.

For network switching and Esplora, see [`descriptor-wallet-switching.md`](descriptor-wallet-switching.md). For on-chain balance authority, see [`onchain-bitboard-wallet-model.md`](onchain-bitboard-wallet-model.md).

## Separate rail, not BDK changeset

- **On-chain** balance and history come from the BDK wallet (`DescriptorWalletData.changeSet`) and Esplora sync.
- **Arkade** balance and history come from the Arkade operator and **ark-rs** (`bitboard-ark` WASM) in `arkade.worker`.
- Do not merge Arkade totals into the BDK dashboard balance.

## One Bitboard wallet, operator connections per live network

- Arkade state is stored as **operator connections** in encrypted `wallet_secrets` (`arkadeOperatorConnections[]`), NWC-style. Each connection is one ASP with its own `sdkPersistenceJson`, URLs, and canonical `operatorSignerPkHex` from `getInfo`.
- `activeArkadeConnectionIdByNetwork` picks the connection used for session, dashboard, and sync on `mainnet`, `testnet`, and `signet` (Mutinynet). Switching operators is adding/switching connections—not merging blobs across ASPs.
- **BitboardArkPersistence** (`sdkPersistenceJson`, engine `ark-rs`, wire `version: 3`) includes `operator_identity` and an `offchain_vtxo_snapshot` inside `wallet_db`. Balance and history read from the loaded WASM session immediately after unlock (local snapshot + Esplora boarding + on-chain bumper).
- **Operator sync** (`sync_with_operator`) refreshes the snapshot and re-exports `sdkPersistenceJson` to the active connection row. `lastSuccessfulOperatorSyncAt` on the connection mirrors `lastSuccessfulEsploraSyncAt` for on-chain BDK.
- **Local-first:** Operator failure during a session keeps the last-synced blob; the dashboard may show a stale banner until operator sync succeeds this unlock.

## Persistence in the worker

`bitboard-ark` exports a `BitboardArkPersistence` JSON envelope (`version: 3`) after critical RPCs, operator sync, and on `closeSession`. Unsupported or malformed blobs start from an empty `wallet_db` on session open.

### Offchain receive derivation cursor

`walletDb` inside `sdkPersistenceJson` stores the offchain receive cursor as **one scalar**:

- `offchain_next_derivation_index: u32` — next index to assign on reveal (`Bip32KeyProvider::next_index`); after the first reveal of index `0`, the value is `1`.
- Display index on peek: `max(0, offchain_next_derivation_index - 1)` when `next > 0`, else `0` on first use.

Do **not** persist arrays of derivation indices or per-index metadata in `sdkPersistenceJson`; that pattern bloated encrypted secrets and caused failed writes. Session open restores the scalar, warms the key cache locally for `0..index`, and read paths (`getAddress`, balance, history) never block on wallet-secrets re-encrypt.

### Offchain VTXO snapshot and signer-aware balance

`wallet_db.offchain_vtxo_snapshot` stores the last operator-synced VTXO list plus `server_pk_hex` on each `VirtualTxOutPointRecord`. That per-VTXO operator signer key lets the wallet **recompute** balance buckets offline using cached `getInfo` and the current wall clock—same rules as live `offchain_balance()` in ark-client.

Balance buckets (`pre_confirmed`, cooperatively spendable `confirmed`, `recoverable`, `pending_recovery`) are **not** stored as separate persisted totals. After operator signer rotation cutoff, funds on a deprecated key appear in `pending_recovery_sats` until unilateral exit or recoverable settlement. Re-sync refreshes vtxo rows and `server_pk_hex` values.

### Balance buckets and how they combine

Arkade balance is not one monolithic number. Bitboard classifies funds into buckets at several layers, then maps them to dashboard fields in `bitboard-ark/src/balance_display.rs` (`build_arkade_balance_dto`).

#### Layer 1 — VTXO state (`ark-core` `VtxoList`)

Each VTXO in `wallet_db.offchain_vtxo_snapshot` lands in exactly one state bucket:

| Bucket | Meaning |
|--------|---------|
| **pre_confirmed** | Incoming Ark payment, not yet batch-settled (`is_preconfirmed`) |
| **confirmed** | Batch-settled, normally cooperatively spendable offchain |
| **recoverable** | Expired, operator-swept, or sub-dust — not sendable offchain, but recoverable via batch settle |
| **spent** | `is_spent`, `is_swept`, or **`is_unrolled`** (unilateral exit started) |

Unilateral exits move VTXOs into **spent** with `is_unrolled = true` until completion.

#### Layer 2 — Signer-aware offchain totals (`compute_offchain_balance`)

Replayed from the snapshot (same rules as live `ark-client::offchain_balance`):

| Bucket | Source |
|--------|--------|
| **pre_confirmed_sats** | `pre_confirmed` ∩ signer-spendable |
| **confirmed_sats** | `confirmed` ∩ signer-spendable |
| **recoverable_sats** | all `recoverable` |
| **pending_recovery_sats** | `pre_confirmed`/`confirmed` locked under a **deprecated operator signer** past cooperative cutoff |

**Gross spendable offchain** = `pre_confirmed_sats + confirmed_sats`. VTXOs in **spent** (including unrolled exits) are excluded.

#### Layer 3 — Bitboard sub-buckets

| Bucket | What it is |
|--------|------------|
| **recoverable_settleable** | Operator-swept or sub-dust recoverable VTXOs — actionable via **Recover now** |
| **recoverable_pending_operator_sweep** | Client-expired VTXOs awaiting operator sweep before batch settle is safe |
| **boarding_spendable** | Confirmed on-chain UTXOs on the boarding address, ready to settle into VTXOs |
| **boarding_pending** | Unconfirmed boarding UTXOs |
| **onchain_bumper** | Confirmed sats in the P2A bumper wallet (exit fees only — not Ark spendable balance) |
| **unilateral_exit_in_progress** | Sum of `spent` VTXOs with `is_unrolled && !is_spent` (informational; already excluded from gross spendable) |
| **collaborative_exit_in_progress** | Pending exit deduction while the operator snapshot still lists exiting VTXOs as cooperatively spendable |

#### Layer 4 — Dashboard fields

| Field | Formula / rule |
|-------|----------------|
| **offchain_spendable_sats** | Gross spendable offchain minus **collaborative** exit in progress only |
| **confirmed_sats** | `offchain_spendable_sats + onchain_bumper_sats` (same collaborative subtraction) |
| **total_sats** | Gross offchain + recoverable sub-buckets + pending recovery + bumper + boarding pending, minus collaborative exit in progress |
| **Dashboard headline** (UI) | `offchain_spendable_sats + boarding_spendable_sats` |

**Unilateral exit in progress** is shown as an informational “−” line but is **not** subtracted again from spendable totals — those VTXOs are already out of gross spendable via the **spent** bucket once unroll completes. See [Unilateral vs collaborative exit balance timing](#unilateral-vs-collaborative-exit-balance-timing) for the phase handoff.

**Collaborative exit in progress** is still subtracted while the snapshot lists the exiting VTXOs as spendable; pending exit deduction records track that gap until operator sync updates the snapshot.

Operator access from the browser uses **REST** (`ark-rest` + grpc API shim), not grpc-web.

## Exiting to on-chain

Management → Arkade offers two paths:

| Path | Operator required | Use when |
|------|-------------------|----------|
| **Collaborative exit** | Yes | Default; batches with operator; one settlement to your `bc1` address |
| **Unilateral exit** | No (after unroll) | Operator down or you need trustless exit; per-VTXO; multiple on-chain txs |

Collaborative exit and unilateral unroll are implemented in `bitboard-ark` (`collaborative_redeem`, `broadcast_next_unilateral_exit_node`, etc.). The on-chain bumper wallet shares the same BIP32-derived BDK wallet as boarding. Select one VTXO at a time in the UI.

### Unilateral vs collaborative exit balance timing

Unilateral and collaborative exits use **different balance mechanics**. Collaborative exit VTXOs stay in the operator snapshot as cooperatively spendable until the operator processes the exit, so `collaborative_exit_in_progress_sats` is subtracted from net spendable fields until sync clears the pending deduction record.

Unilateral exit is more subtle: the **same sats** are tracked in different snapshot buckets as unroll progresses, while `unilateral_exit_in_progress_sats` stays stable for the UI “exit pipeline” line.

| Phase | Snapshot state | In gross spendable? | `unilateral_exit_in_progress` source | Subtract from net spendable? |
|-------|----------------|---------------------|--------------------------------------|------------------------------|
| Before unroll | `confirmed` | Yes | 0 | No |
| During unroll (broadcast in flight) | still `confirmed` | Yes | `pending_exit_deductions` (unilateral) | No in WASM/UI steady-state rules* |
| After unroll | `spent` (`is_unrolled = true`) | No — excluded by `VtxoList` | sum of `spent` with `is_unrolled && !is_spent` | No — already excluded from gross |

\*The brief “during unroll” window rarely affects the dashboard because the user stays on the unroll modal until WASM returns. Optimistic UI (`arkade-exit-balance-optimistic.ts`) only bumps `unilateralExitInProgressSats` for unilateral paths; it does **not** reduce `confirmedSats` / `offchainSpendableSats`, matching post-unroll WASM behaviour and avoiding double-subtraction once the VTXO moves to `spent`.

**Handoff between pending record and spent bucket**

1. First unroll broadcast → `record_pending_unilateral_exit` writes a pending deduction; the VTXO is still spendable in the snapshot.
2. Unroll completes → `mark_vtxo_unrolled_in_snapshot` sets `is_unrolled = true` locally (gross spendable drops **before** operator sync realigns the snapshot).
3. `reconcile_pending_exit_deductions` drops the pending unilateral record once the VTXO is no longer spendable.
4. `exit_balance_components` counts the same amount from the `spent` bucket until on-chain completion (`is_spent`).

Bitboard keeps the **exit line amount stable** across steps 1→4. Net spendable must not subtract `unilateral_exit_in_progress_sats` after step 2 — doing so double-counted the exit against unrelated VTXOs (e.g. a fresh boarding credit). Collaborative exit has no equivalent handoff: the field clears when operator sync removes the VTXOs from spendable entirely.

Implementation touchpoints: `build_arkade_balance_dto` (WASM), `exit_balance_components` / `reconcile_pending_exit_deductions` (persistence), `arkade-exit-balance-optimistic.ts` (React Query cache).

### Unilateral exit completion coin-select (vendor fork)

After unroll, completing the exit spends on-chain UTXOs that fund the exit PSBT. Upstream `ark-client` coin-select requires Esplora `confirmation_blocktime` and skips inputs without it. Bitboard vendors a permissive fork in `third_party/ark-client/src/coin_select.rs` (`coin_select_vtxo_txids_for_onchain`):

- **Why:** arkade-regtest and other minimal Esplora backends often omit `block_time` even for confirmed txs. Requiring blocktime blocked REG-04 completion tests and local unilateral-exit debugging. Production paths usually get blocktime from Esplora; `bitboard-ark` also backfills from `/tx/{txid}/status` when the address UTXO listing omits it.
- **Behavior:** Missing blocktime is treated as epoch zero for timelock checks; inputs are still selectable. The completion fee estimate includes `missingBlocktimeInputs` (virtual txid + on-chain outpoint) and the UI shows a non-blocking warning (contract `ARK-EXIT-04`).
- **Not a mainnet trust relaxation by design:** The fork exists for regtest convenience and indexer-gap tolerance; missing blocktime should be rare on well-behaved Esplora.

## Mnemonic alignment

- Same BIP39 mnemonic as the Bitboard wallet; Arkade uses `MnemonicIdentity` (BIP86 account 0).
- Arkade **receive addresses** (`ark1` / `tark1`) differ from on-chain `bc1` receive addresses.
- `delegatorProvider` is set at **first** Arkade wallet creation per network; it changes the offchain tapscript.

## Delegator (Fulmine)

- Default delegator URLs are selected by `NetworkMode` (see `arkade-endpoints.ts`).
- Bitboard-hosted Fulmine renews VTXOs without holding user keys (presigned intents).
- Users should read Library / SECURITY for operator and delegator trust.

## Lab and regtest

- **Lab** and **regtest** have no Arkade UI in v1.
- Regtest Fulmine is reserved for a later phase.

## Lightning

- Arkade is an alternative L2 path for education, not a replacement for optional NWC Lightning connections.

## Operator signer rotation

When an Arkade operator rotates its signing key, `getInfo` advertises the new `signerPubkey` and lists the previous key under `deprecatedSigners` with a cooperative cutoff timestamp. Bitboard uses **rust-sdk** rotation support (`Info::signer_status_at`, `migrate_deprecated_signer_vtxos`, deprecated-aware `discover_keys`).

| Regime | Condition | Bitboard behavior |
|--------|-----------|-------------------|
| **Current** | Stored signer matches live signer | Normal session |
| **Migratable / Due now** | Stored signer is deprecated, cooperative window open | Session opens; banner may offer cooperative migration to current signer |
| **Expired** | Deprecated signer past cutoff | Session opens for recovery; cooperative send/migrate unavailable; unilateral exit or recoverable settle |

Contracts `ARK-ROT-01` through `ARK-ROT-05` in `doc/features/arkade.yaml` define session open, persistence re-stamp, error messaging, and Management banner behavior.

Cooperative fund migration uses `migrate_deprecated_signer_vtxos()` (ark-client 0.9.3+). Bitboard loops migrate passes internally until cooperative work is complete (or a pass cap), and **only then** re-stamps `operator_identity` with the current operator signer. Partial passes keep the migration banner and deprecated signer in persistence; the UI prompts **Migrate again** until complete. Post-cutoff funds appear in `pending_recovery` until unilateral exit or recoverable settlement; a **pending-recovery banner** on Dashboard and Management links to unilateral exit when `pendingRecoverySats > 0`. This is **not** the admin `WalletInitializerService_Restore` API (operator on-chain wallet setup only).

### Recoverable vs pending recovery (manual batch recover)

| Bucket | Typical cause | User action in Bitboard |
|--------|---------------|-------------------------|
| **pending_recovery** | Deprecated operator signer past cooperative cutoff; VTXO not yet expired/swept | Unilateral exit path; shown in balance breakdown, not the recoverable banner |
| **recoverable** | Expired, operator-swept, or sub-dust VTXOs | Non-blocking banner on Dashboard and Management with count, total, optional fee estimate, and **Recover now** (`settle_vtxos` on recoverable outpoints only—no boarding, no auto-recover on sync) |

Contracts `ARK-REC-01` through `ARK-REC-06` in `doc/features/arkade.yaml` define banner visibility, fee display, and the user-initiated recover action.
