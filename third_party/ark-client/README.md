# ark-client

High-level client library for interacting with Arkade servers.

`ark-client` provides the main wallet/client abstractions for receiving, selecting, and sending VTXOs, boarding funds on-chain, estimating fees, watching VTXO state, and coordinating Arkade rounds through the supported transport clients.

## Bitboard fork

This directory is a **vendored fork** of [ark-client 0.9.3](https://github.com/arkade-os/rust-sdk/tree/master/crates/ark-client). The workspace root `Cargo.toml` applies it with `[patch.crates-io]`.

When pulling a newer upstream release, re-apply the patches below and run the listed regressions. Several divergences are also documented inline (`Bitboard vendor patch` in source).

Human testing overview: [`TESTING.md`](../../TESTING.md). Ark regtest fixture notes: [`frontend/tests/e2e/fixtures/arkade-regtest/README.md`](../../frontend/tests/e2e/fixtures/arkade-regtest/README.md).

### Patches

| Area | Problem | Fix | Primary files | Regression |
|------|---------|-----|---------------|------------|
| **VTXO batch-tree signing** | Tonic/REST can deliver both `TreeNonces` and `TreeNoncesAggregated`; signing twice consumed musig nonces and failed with “missing nonce for tree TX …”. Event order can also place `TreeSigningStarted` before the final `TreeTx` chunk, or deliver late chunks after signing started. | Shared signing state machine with `vtxo_batch_tree_signatures_submitted` guard, buffered graph chunks, deferred `TreeSigningStarted` flush, and nonce refresh when the rebuilt graph changes. | `src/batch.rs`, `src/batch_vtxo_tree_signing.rs` | `ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test signer_migration_session_regtest cooperative_signer_migration_clears_pending_recovery_with -- --ignored --test-threads=1` |
| **Deprecated signer migration** | After server signer rotation, VTXOs and boarding UTXOs under old keys must be discovered, classified (`pending_recovery` vs spendable), and cooperatively migrated without oversized batches. | `migrate_deprecated_signer_vtxos`, per-VTXO `server_pk`, balance split including `pending_recovery`, connect-time boarding seed for all server keys, background migration arm in the VTXO watcher. | `src/migration.rs`, `src/lib.rs`, `src/vtxo_watcher.rs` | `signer_migration_session_regtest`, `pending_recovery_balance_regression` |
| **Unilateral exit — completion fee** | Upstream hard-coded a 1 000 sat completion fee. | Build-and-measure fee targeting from Esplora fee rate (iterative vsize measurement). | `src/unilateral_exit.rs` | `autonomous_unilateral_exit_session_regtest`; E2E REG-04 |
| **Unilateral exit — indexer paging** | arkd rejects vtxo/chain queries without explicit positive `page.size`. | Paginated chain and virtual-tx fetches (page size 100). | `src/unilateral_exit.rs` | Prefetch during operator sync; E2E REG-04 |
| **Unilateral exit — commitment visibility** | Esplora may lag behind arkd’s round commitment broadcast. | Short poll loop before treating commitment as missing during unroll. | `src/unilateral_exit.rs` | Prefetch during operator sync; E2E REG-04 |
| **Completion coin-select** | After unroll, indexer marks VTXOs `is_spent`/`is_unrolled` so `all_unspent()` drops them; thin Esplora stacks often omit `confirmation_blocktime`. | `coin_select_vtxo_outpoints_for_onchain` searches `vtxo_list.all()` for exact virtual [`OutPoint`] matches, allows missing blocktime with `Duration::ZERO` (surfaced via `VtxoCompletionSelection::missing_blocktime_inputs`). | `src/coin_select.rs` | `autonomous_unilateral_exit_session_regtest` (`autonomous_unroll_and_complete_without_operator_sync`) |
| **Boarding / batch settle** | arkd rejects stale boarding inputs past the cooperative window; boarding intents need the operator intent fee reserved in the offchain output. Post-register SSE must outlast ASP `sessionDuration`. Treating any pre-selection `BatchFailed` as ours aborted Mutinynet boarding before ack. | `is_past_arkd_cooperative_boarding_window`, `board_to_amount_after_intent_fee`; `BATCH_EVENT_TIMEOUT` 180s; `batch_failure_matches_our_round` only after we joined (`batch_id` set); timeout → `JoinBatchOutcome::Waiting`. | `src/batch.rs` | E2E arkade-regtest boarding flows; signer migration native boarding test |
| **Batch intent delete (WASM)** | Pending intents can wedge later rounds if client drops after register and before follow-up signing. arkd `deleteIntent` matches only VTXO `Inputs`, not `BoardingInputs`. | Added `delete_registered_intent` using ownership-only proofs (`Delete` message, empty outputs, `expire_at: 0`). Boarding-only cancel surfaces an explicit error; boarding-only retry re-joins without calling `deleteIntent`. | `src/batch.rs`, `src/ark_grpc_wasm_shim.rs`, `src/error.rs` | Vitest pending-intent Cancel/Retry flows |
| **WASM transport** | PWA has no native gRPC; needs REST-backed `ark_grpc` surface. | `ark_grpc_wasm_shim.rs` implements the client API over `ark-rest` (event stream, indexer, intents). | `src/ark_grpc_wasm_shim.rs` | Playwright Ark flows; `cargo test -p ark-rest --target wasm32-unknown-unknown` |
| **Receive / address discovery** | VTXOs under deprecated signers were invisible; receive address handling diverged from on-chain. | Discover and persist addresses for current + deprecated server keys; harmonized receive paths. | `src/lib.rs`, `src/key_provider.rs` | `signer_migration_session_regtest`, receive E2E |
| **Collaborative exit (WASM)** | Off-chain send / exit path failed through the REST shim. | Shim fixes for pending-tx and related REST conversions (see commit history). | `src/ark_grpc_wasm_shim.rs`, `src/send_vtxo.rs` | Collaborative exit E2E / Vitest |

Upstream contribution target for portable client fixes: [arkade-os/rust-sdk](https://github.com/arkade-os/rust-sdk). Operator/protocol bugs we cannot patch here: [`docs/arkade-upstream-fix-proposals.md`](../../docs/arkade-upstream-fix-proposals.md) (ARK-UP-01 covers boarding `deleteIntent`).

## Install (upstream)

```toml
[dependencies]
ark-client = "0.9.3"
```

Enable optional SQLite storage support with:

```toml
ark-client = { version = "0.9.3", features = ["sqlite"] }
```

Bitboard does **not** use crates.io for this crate; depend on the path patch above.

## Documentation

API documentation for the upstream crate is on [docs.rs/ark-client](https://docs.rs/ark-client).
