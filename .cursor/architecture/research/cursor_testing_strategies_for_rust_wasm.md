# Testing strategies for Rust WASM Bitcoin wallet
_Exported on 3/3/2026 at 11:01:45 GMT+1 from Cursor (2.5.26)_

---

**User**

Research the current best practices and crates for testing Rust code that compiles to WASM, specifically for a Bitcoin wallet using BDK (bdk_wallet, bdk_esplora). I need to understand:

1. **HTTP mocking in WASM tests**: The wallet syncs via Esplora (HTTP REST API). What crates work for mocking HTTP in WASM? Does `wiremock` work in wasm32-unknown-unknown? What about `mockito`? What alternatives exist? Can `reqwest` (which bdk_esplora uses internally) be mocked in WASM?

2. **wasm-pack test setup**: How does `wasm-pack test --headless` work? What test framework does it use (wasm-bindgen-test)? Can you run async tests? How do you set up fixtures?

3. **Mocking strategies for BDK**: BDK uses traits for persistence and blockchain access. Can we use mock implementations of these traits for testing? What about `mockall` crate - does it work with wasm32?

4. **Regular cargo test (non-WASM)**: Can the wallet logic be tested with regular `cargo test` (not targeting wasm32) by keeping wasm-bindgen exports separate from core logic? This would allow using the full ecosystem of testing crates (wiremock, mockall, etc.).

5. **What crates are commonly used for testing in Rust**: `mockall`, `wiremock`, `httpmock`, `proptest`, `test-case`, `rstest` - which of these work well for this use case?

Search the web for:
- "bdk_wallet testing strategy rust 2025 2026"
- "wasm-bindgen-test async mocking"
- "rust wasm testing http mock"
- "mockall wasm32 compatibility"
- "bdk_esplora mock testing"

Return a detailed summary of findings with specific crate recommendations and version numbers.

---

**Cursor**

Let me research all of these topics thoroughly.

Now let me look at the existing project structure and plan to understand the context better.

Now let me also check the existing project structure for context.

Now I have enough information to compile a comprehensive answer. Let me look at one more thing - the actual plan's later phases for testing context.

Here is my comprehensive research summary:

---

## Testing Rust WASM + BDK: Detailed Findings

### 1. HTTP Mocking in WASM Tests

**The hard truth: none of the standard HTTP mocking crates work in `wasm32-unknown-unknown`.**

| Crate | Works in wasm32? | Why not |
|-------|-----------------|---------|
| `wiremock` (0.6) | No | Spins up a real `hyper` HTTP server locally; depends on `tokio` runtime, sockets, threading |
| `mockito` | No | Same architecture — binds a local TCP socket |
| `httpmock` | No | Same — local mock HTTP server |
| `reqwest_mock` | No (archived) | Last release 2020, archived 2023, no WASM support |

**Why this is a dead end for WASM targets:** All these crates start a real HTTP server on `localhost`. The `wasm32-unknown-unknown` target has no socket, no filesystem, no threads. The `reqwest` client used by `bdk_esplora` in WASM mode compiles against the browser's Fetch API — it can't hit `localhost` ports spun up inside the same WASM sandbox.

**Possible alternatives for the WASM side:**

- **Mock Service Worker (MSW)** — a JavaScript library that intercepts `fetch()` at the service worker level in the browser. If you run `wasm-pack test --headless --chrome`, the WASM code makes real `fetch()` calls through the browser. You could theoretically register an MSW service worker before the test. However, integrating MSW into `wasm-bindgen-test` is non-trivial and undocumented.
- **Custom JS mock injection** — use `#[wasm_bindgen]` to call into JavaScript test helpers that monkey-patch `fetch()`. Fragile and hard to maintain.

**Bottom line:** HTTP-level mocking is best done in native `cargo test`, not in WASM tests.

---

### 2. `wasm-pack test --headless` Setup

**How it works:**

1. `wasm-pack test` wraps `wasm-bindgen-test-runner`, which compiles your test crate to WASM
2. It starts a local web server + WebDriver (ChromeDriver/geckodriver)
3. The WASM test binary runs inside a real browser via WebDriver protocol
4. `--headless` runs the browser without a GUI (suitable for CI)
5. `--chrome`/`--firefox` selects the browser

**Test framework:** `wasm-bindgen-test` (current version `0.3.x`)

```toml
[dev-dependencies]
wasm-bindgen-test = "0.3"
```

**Async tests are supported:**

```rust
use wasm_bindgen_test::*;
wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
async fn test_something_async() {
    let result = some_async_fn().await;
    assert_eq!(result, expected);
}
```

**Fixtures:** There's no built-in fixture system. You write setup/teardown manually, or use helper functions. No equivalent of `rstest`'s fixtures. The `#[wasm_bindgen_test]` attribute does not support parameterization.

**Limitations:**
- No `println!` — use `console_log!` macro or `web_sys::console::log_1`
- No filesystem — can't use `tempfile` or similar
- No `std::thread` — single-threaded environment
- Tests run in the browser, so they have access to browser APIs (DOM, fetch, IndexedDB)

---

### 3. Mocking Strategies for BDK

**BDK's key traits:**

`WalletPersister` (from `bdk_wallet 2.3.0`) has a simple interface:

```rust
pub trait WalletPersister {
    type Error;
    fn initialize(persister: &mut Self) -> Result<ChangeSet, Self::Error>;
    fn persist(persister: &mut Self, changeset: &ChangeSet) -> Result<(), Self::Error>;
}
```

This is trivially mockable — you can write a simple `InMemoryPersister` that stores changesets in a `Vec<ChangeSet>`. BDK already supports in-memory wallets via `Wallet::create(...).create_wallet_no_persist()`.

**`EsploraAsyncExt`** (from `bdk_esplora 0.22.x`) is harder to mock:

```rust
pub trait EsploraAsyncExt {
    fn full_scan<K, R>(&self, request: R, stop_gap: usize, parallel_requests: usize)
        -> Pin<Box<dyn Future<Output = Result<FullScanResponse<K>, Box<Error>>> + Send>>;
    fn sync<I, R>(&self, request: R, parallel_requests: usize)
        -> Pin<Box<dyn Future<Output = Result<SyncResponse, Box<Error>>> + Send>>;
}
```

This trait has generic parameters (`K`, `R`, `I`) which make it hard to use with `mockall`'s `#[automock]`. You'd need to write a manual mock or wrap the sync/full_scan behind your own simpler trait.

**`mockall` and wasm32:** There are no explicit issues filed about `wasm32` incompatibility, but `mockall` depends on `thread_local!` internally for test expectation state. In `wasm32-unknown-unknown`, `thread_local!` works (since it's single-threaded, `thread_local` is just a global), but some edge cases around `std::sync` primitives (Mutex) may cause issues. **`mockall` is likely fine for native `cargo test` but risky/untested for `wasm32-unknown-unknown` targets.** The generic-heavy `EsploraAsyncExt` trait is a separate challenge regardless of target.

**Recommended mocking approach for BDK:**

1. **Define your own abstraction trait** over the Esplora operations you actually use (e.g., `trait BlockchainClient { async fn full_scan(...) -> Result<...>; async fn sync(...) -> Result<...>; }`)
2. Implement it for the real `esplora_client::AsyncClient` in production
3. Implement a `MockBlockchainClient` for testing that returns canned `FullScanResponse`/`SyncResponse` data
4. Use `WalletPersister` with a trivial in-memory implementation, or just use `create_wallet_no_persist()`

---

### 4. Native `cargo test` (Non-WASM) — The Recommended Strategy

**This is the most practical approach for the crypto crate.** The architecture plan already separates concerns well:

```
crypto/src/
  lib.rs              # wasm-bindgen entry, re-exports
  mnemonic.rs         # BIP39 (pure logic)
  descriptors.rs      # descriptor derivation (pure logic)
  wallet.rs           # BDK wallet wrapper
  esplora.rs          # Esplora sync
  transaction.rs      # PSBT build/sign
```

**The key insight:** Only `lib.rs` needs `#[wasm_bindgen]` exports. Everything else is pure Rust. If you keep the `wasm_bindgen` annotations only on thin wrapper functions in `lib.rs`, and the actual logic in separate modules, then:

- `cargo test` (native target) tests all core logic with the full Rust testing ecosystem
- `wasm-pack test` (WASM target) only tests the thin `wasm_bindgen` boundary — that serialization/deserialization works, that functions are callable from JS

**For native testing, the full ecosystem is available:**

| Crate | Purpose | Works natively | Version |
|-------|---------|---------------|---------|
| `wiremock` | HTTP mock server | Yes | 0.6 |
| `mockall` | Trait mocking | Yes | 0.13 |
| `proptest` | Property-based testing | Yes | 1.5 |
| `rstest` | Parameterized tests + fixtures | Yes | 0.23 |
| `test-case` | Parameterized tests | Yes | 3.3 |
| `assert_matches` | Pattern matching assertions | Yes | 1.5 |
| `tempfile` | Temp dirs for persistence tests | Yes | 3.x |
| `tokio` (test) | Async test runtime | Yes | 1.x |

**Architecture pattern:**

```toml
# crypto/Cargo.toml
[lib]
crate-type = ["cdylib", "rlib"]  # cdylib for WASM, rlib for native tests

[dev-dependencies]
# All of these work with `cargo test` (native target)
wiremock = "0.6"
mockall = "0.13"
rstest = "0.23"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
assert_matches = "1.5"
tempfile = "3"
```

For Esplora testing specifically with `wiremock`, you could:

1. Stand up a `wiremock::MockServer` that mimics Esplora's REST API
2. Configure `esplora_client::Builder::new(mock_server.uri())` to point at it
3. Test the full sync flow with deterministic HTTP responses

This **only works in native `cargo test`**, not in WASM.

---

### 5. Summary of Crate Compatibility

| Crate | Native `cargo test` | `wasm32-unknown-unknown` | Notes |
|-------|:---:|:---:|-------|
| `mockall` 0.13 | Yes | Uncertain (likely no) | Uses `thread_local!`, `Mutex`; untested on wasm32 |
| `wiremock` 0.6 | Yes | No | Needs TCP sockets |
| `httpmock` | Yes | No | Needs TCP sockets |
| `mockito` | Yes | No | Needs TCP sockets |
| `proptest` 1.5 | Yes | No | Uses `std::os::unix`, `rusty-fork` |
| `rstest` 0.23 | Yes | Uncertain | No explicit wasm32 support documented |
| `test-case` 3.3 | Yes | Likely yes | Pure proc-macro, no OS deps |
| `assert_matches` 1.5 | Yes | Yes | Trivial macro |
| `wasm-bindgen-test` 0.3 | N/A | Yes | The only option for WASM tests |
| `bdk_testenv` 0.13 | Yes | No | Runs `bitcoind` + `electrs` regtest |

---

### Recommended Testing Architecture

Given all findings, here's the recommended layering:

**Layer 1 — Native `cargo test` (primary, covers 90% of logic):**
- Mnemonic generation/validation
- Descriptor derivation
- Wallet creation, address generation, balance computation (using `create_wallet_no_persist()`)
- ChangeSet serialization round-trips
- Esplora sync logic (using `wiremock` to mock the Esplora REST API)
- Transaction building and signing (with in-memory wallet)
- Use `mockall` for any custom trait abstractions
- Use `rstest` or `test-case` for parameterized tests (e.g., test across Network::Bitcoin, Network::Testnet, Network::Signet)

**Layer 2 — `wasm-pack test --headless --chrome` (thin boundary tests):**
- Verify `#[wasm_bindgen]` exports are callable
- Verify JsValue serialization/deserialization round-trips
- Verify async exports work through `wasm-bindgen-futures`
- Do NOT test HTTP/blockchain logic here — that's covered natively

**Layer 3 — E2E with Playwright (integration across the full stack):**
- Wallet creation flow
- Receive address display
- Send flow against a regtest environment (with a real Esplora instance)

This architecture means your `crypto/` crate tests run fast with `cargo test`, use the full power of Rust's testing ecosystem, and only the boundary validation requires the slower `wasm-pack test` pipeline.

