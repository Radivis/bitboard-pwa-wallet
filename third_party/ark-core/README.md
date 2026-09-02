# ark-core

Core types and utilities for the Arkade protocol (vendored fork).

## Bitboard fork

Vendored from [ark-core 0.9.3](https://github.com/arkade-os/rust-sdk/tree/master/crates/ark-core), applied via `[patch.crates-io]` in the workspace root `Cargo.toml`.

Upstream contribution target: [arkade-os/rust-sdk](https://github.com/arkade-os/rust-sdk).

### Patches

| Area | Problem | Fix | Primary files |
|------|---------|-----|---------------|
| **VTXO bucket naming** | Upstream `spent()` bucket is not `is_spent=true`; it lumps in-progress unilateral exits (`is_unrolled && !is_spent`) with finalized outputs. | Add `exiting()` sub-bucket; rename concept to `unspendable()` (exiting + finalized). `spent()` kept as compat alias. | `src/vtxo_list.rs` |
| **Unrolled vs recoverable** | `VtxoList::new` checked `is_recoverable` before `is_unrolled`, so expired exiting VTXOs landed in recoverable (contradicts arkd `recoverable_only`). | Classify `is_unrolled && !is_spent` into `exiting` before recoverable; `is_recoverable` returns false when `is_unrolled`. | `src/vtxo_list.rs`, `src/server.rs` |

Human testing overview: [`TESTING.md`](../../TESTING.md).
