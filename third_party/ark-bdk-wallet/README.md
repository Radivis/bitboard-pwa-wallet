# ark-bdk-wallet

BDK wallet integration for Arkade clients.

This crate implements `ark-client` on-chain wallet traits using [`bdk_wallet`](https://crates.io/crates/bdk_wallet), with Esplora support on native and WebAssembly targets.

## Bitboard fork

Vendored from [ark-bdk-wallet 0.9.3](https://github.com/arkade-os/rust-sdk/tree/master/crates/ark-bdk-wallet), applied via `[patch.crates-io]` in the workspace root `Cargo.toml`.

This crate has **few behavioral patches** relative to `ark-client` and `ark-rest`. The meaningful Bitboard-specific changes wire it to our other forks:

| Area | Change | Primary files |
|------|--------|---------------|
| **BDK stack** | `bdk_wallet` 2.3 + `bdk_esplora` 0.22 + `esplora-client` 0.12 (aligned with `bitboard-crypto`; drops transitive `rustls-pemfile`). Drop when upstream adopts this stack. | `Cargo.toml`, `src/lib.rs` |
| **Patched Esplora client** | Uses workspace `esplora-client` directly (not only via `bdk_esplora` re-exports) so WASM gets per-request timeouts from our Esplora fork. | `src/lib.rs` |
| **WASM sleep** | `WebSleeper` implements `esplora_client::Sleeper` with `gloo_timers` for async Esplora polling in the browser. | `src/lib.rs`, `src/utils.rs` |

Esplora timeout behavior is documented in [`../esplora-client/README.md`](../esplora-client/README.md).

## Install (upstream)

```toml
[dependencies]
ark-bdk-wallet = "0.9.3"
```

## Documentation

API documentation for the upstream crate is on [docs.rs/ark-bdk-wallet](https://docs.rs/ark-bdk-wallet).
