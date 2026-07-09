# ark-rest

REST transport client for Arkade servers.

This crate contains generated REST API bindings plus a Rust client wrapper for Arkade service, indexer, admin, signer manager, and wallet endpoints.

## Bitboard fork

Vendored from [ark-rest 0.9.3](https://github.com/arkade-os/rust-sdk/tree/master/crates/ark-rest), applied via `[patch.crates-io]` in the workspace root `Cargo.toml`.

Regenerating from OpenAPI (`just merge-swagger generate`) can overwrite hand-edited API files — re-apply the patches below and run regressions.

**Not a fork patch (upstream 0.9.3):** `X-Build-Version` / `X-SDK-Version` on every request — values come from `ark_core::server::{TARGET_ARKD_VERSION, SDK_VERSION}` in `build_reqwest_client`. We had fixed the pre-0.9.3 mistake of sending the crate version as `X-Build-Version` locally; that was absorbed when we vendored 0.9.3 ([upstream PR #229](https://github.com/arkade-os/rust-sdk/pull/229), since 0.9.1).

### Patches

| Area | Problem | Fix | Primary files | Regression |
|------|---------|-----|---------------|------------|
| **Query array encoding** | openapi-generator Rust client comma-joins `style: simple` array params (`?scripts=a,b`). arkd expects repeated keys (`?scripts=a&scripts=b`) and rejects comma-joined script/outpoint/topic lists. | `repeated_simple_query_pairs` used in generated API call sites; source tests forbid `match "csv"` regressions. | `src/openapi_query_arrays.rs`, `src/apis/indexer_service_api.rs`, `src/apis/ark_service_api.rs` | `cargo test -p ark-rest openapi_query_encoding`, `bitboard-ark/tests/ark_rest_query_encoding_regression.rs` |
| **Mutually exclusive `list_vtxos` params** | Sending both `scripts` and `outpoints`, or conflicting filter flags, caused indexer errors. | High-level `Client::list_vtxos` maps `GetVtxosRequest` to exactly one reference type and one filter mode. | `src/client.rs` | Ark session integration tests |
| **Digest mismatch recovery** | Server config digest changes (e.g. after restart) invalidate in-flight clients. | `guarded` requests refresh server info and rebuild the HTTP client on digest mismatch. | `src/client.rs` | Manual / reconnect flows |
| **SSE streaming (WASM)** | Chunk-oriented parsers dropped or mis-parsed events when `data:` lines were split across HTTP reads (common in browser streaming). | Incremental `SseEventParser` accumulates lines until a blank line terminates an event. | `src/sse_stream.rs` | Boarding settle (SSE batch events); `cargo test -p ark-rest --target wasm32-unknown-unknown` |

Upstream contribution target: [arkade-os/rust-sdk](https://github.com/arkade-os/rust-sdk) (`ark-rest`).

Internal maintainer docs for regeneration: [`ARK-REST-README.md`](ARK-REST-README.md).

## Install (upstream)

```toml
[dependencies]
ark-rest = "0.9.3"
```

## Notes

The low-level API modules are generated from the Ark OpenAPI specification and are exposed for advanced use. Most applications should prefer the higher-level `Client` wrapper exported by this crate, or `ark-client` for full wallet/client functionality.

## Documentation

API documentation for the upstream crate is on [docs.rs/ark-rest](https://docs.rs/ark-rest).
