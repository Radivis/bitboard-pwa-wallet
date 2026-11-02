# ark-client

High-level client library for interacting with Arkade servers.

`ark-client` provides the main wallet/client abstractions for receiving, selecting, and sending VTXOs, boarding funds on-chain, estimating fees, watching VTXO state, and coordinating Arkade rounds through the supported transport clients.

## Bitboard fork

This directory is a **vendored fork** of [ark-client 0.12.0](https://github.com/arkade-os/rust-sdk/tree/v0.12.0/ark-client). The workspace root `Cargo.toml` applies it with `[patch.crates-io]`.

When pulling a newer upstream release, re-apply the patches below and run the listed regressions. Several divergences are also documented inline (`Bitboard vendor patch` in source).

Human testing overview: [`TESTING.md`](../../TESTING.md). Ark regtest fixture notes: [`frontend/tests/e2e/fixtures/arkade-regtest/README.md`](../../frontend/tests/e2e/fixtures/arkade-regtest/README.md).

### Patches

| Area | Problem | Fix | Primary files | Regression |
|------|---------|-----|---------------|------------|
| **VTXO batch-tree signing** | 0.9.3 signed on both `TreeNonces` and `TreeNoncesAggregated`. | 0.12 submits partial signatures only from `TreeNonces`. `TreeNoncesAggregated` is logged and does not sign again, so the old double-sign guard is not re-applied. | `src/batch.rs` | Signer-migration and boarding regtests |
| **Deprecated signer migration** | After server signer rotation, VTXOs and boarding UTXOs under old keys must be discovered, classified (`pending_recovery` vs spendable), and cooperatively migrated without oversized batches. | `migrate_deprecated_signer_vtxos`, per-VTXO `server_pk`, balance split including `pending_recovery`, connect-time boarding seed for all server keys, background migration arm in the VTXO watcher. | `src/migration.rs`, `src/lib.rs`, `src/vtxo_watcher.rs` | `signer_migration_session_regtest`, `pending_recovery_balance_regression` |
| **Unilateral exit — completion fee** | Upstream hard-coded a 1 000 sat completion fee. | Build-and-measure fee targeting from Esplora fee rate (iterative vsize measurement). | `src/unilateral_exit.rs` | `autonomous_unilateral_exit_session_regtest`; E2E REG-04 |
| **Unilateral exit — indexer paging** | arkd rejects vtxo/chain queries without explicit positive `page.size`. | Paginated chain and virtual-tx fetches (page size 100). | `src/unilateral_exit.rs` | Prefetch during operator sync; E2E REG-04 |
| **Unilateral exit — commitment visibility** | Esplora may lag behind arkd’s round commitment broadcast. | Short poll loop before treating commitment as missing during unroll. | `src/unilateral_exit.rs` | Prefetch during operator sync; E2E REG-04 |
| **Completion coin-select** | After unroll, indexer marks VTXOs `is_spent`/`is_unrolled` so `all_unspent()` drops them; thin Esplora stacks often omit `confirmation_blocktime`. | `coin_select_vtxo_outpoints_for_onchain` searches `vtxo_list.all()` for exact virtual [`OutPoint`] matches, allows missing blocktime with `Duration::ZERO` (surfaced via `VtxoCompletionSelection::missing_blocktime_inputs`). | `src/coin_select.rs` | `autonomous_unilateral_exit_session_regtest` (`autonomous_unroll_and_complete_without_operator_sync`) |
| **Boarding / batch settle** | arkd rejects stale boarding inputs past the cooperative window; boarding intents need the operator intent fee reserved in the offchain output. Post-register SSE must outlast ASP `sessionDuration`. Treating any pre-selection `BatchFailed` as ours aborted Mutinynet boarding before ack. `SystemTime::now` panics in the browser worker, so intent expiry never got a timestamp. | `is_past_arkd_cooperative_boarding_window`, `board_to_amount_after_intent_fee`; `BATCH_EVENT_TIMEOUT` 180s; `batch_failure_matches_our_round` only after we joined (`batch_id` set); timeout → `JoinBatchOutcome::Waiting`. Intent `valid_at` uses `utils::unix_now` (`js_sys::Date` on wasm). | `src/batch.rs`, `src/utils.rs` | E2E arkade-regtest boarding flows; signer migration native boarding test |
| **Batch intent delete (WASM)** | Pending intents can wedge later rounds if client drops after register and before follow-up signing. arkd `deleteIntent` matches only VTXO `Inputs`, not `BoardingInputs`. | Added `delete_registered_intent` using ownership-only proofs (`Delete` message, empty outputs, `expire_at: 0`). Boarding-only cancel surfaces an explicit error; boarding-only retry re-joins without calling `deleteIntent`. | `src/batch.rs`, `src/ark_grpc_wasm_shim.rs`, `src/error.rs` | Vitest pending-intent Cancel/Retry flows |
| **WASM transport** | PWA has no native gRPC; needs REST-backed `ark_grpc` surface. | `ark_grpc_wasm_shim.rs` implements the client API over `ark-rest` (event stream, indexer, intents). | `src/ark_grpc_wasm_shim.rs` | Playwright Ark flows; `cargo test -p ark-rest --target wasm32-unknown-unknown` |
| **Receive / address discovery** | VTXOs under deprecated signers were invisible; receive address handling diverged from on-chain. Discovery and contract hydrate mark the current receive key used, and a later `LastUnused` (boarding, change) minted the next index. The cursor is what we persist, so the address changed across unlock. | Discover and persist addresses for current + deprecated server keys. `LastUnused` always returns `next_index - 1` when the cursor is past 0, used flag included. A new receive key is only assigned by `KeypairIndex::New`. | `src/lib.rs`, `src/key_provider.rs` | `last_unused_restores_persisted_receive_key_without_advancing`; E2E ARK-RCV-02/04 |
| **Recent-script VTXO sync** | Incremental operator sync must query only the gap window, not every cached HD index. | `Client::derivation_index_for_pk` is public so Bitboard can filter `get_offchain_addresses()` by index. `peek_next_offchain_derivation_index` was already public. | `src/lib.rs` | `bitboard-arkade` incremental VTXO merge unit tests |
| **Collaborative exit (WASM)** | Off-chain send / exit path failed through the REST shim. arkd `INTENT_INSUFFICIENT_FEE` when the reserved gap ignores VTXO `expires_at` (Mutinynet: `amount * 0.002` only while `expiry - now() > 518656`) or is only the flat on-chain output fee (regtest: 1% of inputs plus 250). | Shim fixes for pending-tx and related REST conversions. `prepare_offboard_excluding_vtxos` quotes the full intent fee through `plan_offboard_settlement`, and each VTXO input carries indexer expiry and birth. `join_next_batch` confirms that gap with `EstimateIntentFee` before `RegisterIntent`. | `src/ark_grpc_wasm_shim.rs`, `src/send_vtxo.rs`, `src/batch.rs` | Collaborative exit E2E / Vitest; `mutinynet_intent_fee_is_zero_until_vtxo_expiry_is_set`; `regtest_intent_fee_reserves_input_percent_plus_flat_onchain_output` |

Upstream contribution target for portable client fixes: [arkade-os/rust-sdk](https://github.com/arkade-os/rust-sdk). Operator/protocol bugs we cannot patch here: [`docs/arkade-upstream-fix-proposals.md`](../../docs/arkade-upstream-fix-proposals.md) (ARK-UP-01 covers boarding `deleteIntent`).

## Install (upstream)

```toml
[dependencies]
ark-client = "0.12.0"
```

Enable optional SQLite storage support with:

```toml
ark-client = { version = "0.12.0", features = ["sqlite"] }
```

Bitboard does **not** use crates.io for this crate; depend on the path patch above.

## Documentation

API documentation for the upstream crate is on [docs.rs/ark-client](https://docs.rs/ark-client).
