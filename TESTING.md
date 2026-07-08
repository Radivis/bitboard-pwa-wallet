# Testing

Bitboard is a Rust + WASM + React PWA. Tests are layered by **what they prove**, not by technology alone. The goal is reliable coverage without duplicating the same scenario in Playwright and native Rust.

Agent/human coding rules: `.cursor/rules/testing-strategy.mdc` (TDD procedure, Ark de-duplication). Feature contracts: `doc/features/*.yaml`.

## Strategy at a glance

| Layer | Primary responsibility | Typical tool |
|-------|------------------------|--------------|
| **E2E** | Critical **happy paths** — app works in the browser with real workers | Playwright |
| **Rust integration (regtest)** | Expected **error paths** and **wallet safety invariants** | `bitboard-ark/tests/*_regtest.rs` + arkade-regtest Docker |
| **Rust unit / in-crate** | Pure logic, DTOs, persistence, classification | `cargo test` in `crypto/`, `bitboard-ark/` |
| **Vitest** | Component behavior and **error UX** (banners, dialogs, formatters) | `frontend/` |

**De-duplication:** E2E locks “does the user flow succeed?” Rust regtest locks “when it fails, do we fail safely?” (no false success, persistence not corrupted, no dangerous retries). Vitest locks “does the UI handle the error reasonably?”

Do **not** re-prove the same happy path in E2E and Rust regtest. For Ark, export a **fixture** from E2E when Rust needs boarded state without re-boarding natively.

## Rust workspace

From the repo root:

```bash
cargo test                    # all crates
cargo nextest run             # preferred when [cargo-nextest](https://nexte.st/) is installed
cargo test -p crypto          # single crate
cargo test -p bitboard-ark
```

### `crypto/`

BDK wallet logic, descriptors, Esplora reconcile, Lab entities. Integration-style tests live in `crypto/tests/`. WASM boundary tests in `crypto/tests/wasm_boundary_tests.rs`.

### `bitboard-ark/`

Arkade wallet session (`ArkSession`), persistence, signer migration, exits. Most tests are **in-crate** (`*_tests.rs` next to sources) and run without Docker.

**Regtest integration tests** (optional, need live stack):

| File | Focus |
|------|--------|
| `tests/signer_migration_session_regtest.rs` | Signer rotation + cooperative migration (happy + error paths) |
| `tests/unilateral_exit_session_regtest.rs` | Unilateral unroll / complete on regtest |
| `tests/pending_recovery_balance_regression.rs` | Signer-aware balance classification (unit-style, no Docker) |
| `tests/ark_rest_query_encoding_regression.rs` | REST query encoding |

Run ignored regtest tests (serial — shared `rotate-signer` / Docker):

```bash
# Stack must be up — see “Arkade regtest” below
ARKADE_REGTEST_RUN=1 cargo test -p bitboard-ark --test signer_migration_session_regtest -- --ignored --test-threads=1

# Signer migration with E2E-exported fixture (skip native boarding)
ARKADE_REGTEST_BOARDED_FIXTURE=frontend/test-results/arkade-boarded-fixture.json ARKADE_REGTEST_RUN=1 \
  cargo test -p bitboard-ark --test signer_migration_session_regtest \
  cooperative_signer_migration_clears_pending_recovery_with_boarded_fixture -- --ignored --test-threads=1
```

**Error-path example** (operator down, persistence unchanged):

`migrate_fails_fast_when_discover_keys_cannot_run` in `signer_migration_session_regtest.rs`.

**Happy-path examples:** `cooperative_signer_migration_clears_pending_recovery_with_boarded_fixture` (fixture) or `…_with_native_boarding` (boards via Rust/tonic).

### Vendored Ark crates

`third_party/ark-client` (and related patches) are shared by WASM and native tests. Protocol fixes (e.g. batch signing) should be covered by regtest or targeted unit tests when possible.

## Frontend — Vitest (component / unit)

From `frontend/`:

```bash
npm run test          # watch mode
npm run test:unit     # single run (CI-style)
npm run test:coverage
npm run test:ui       # Vitest UI
```

Tests live beside sources (`**/__tests__/**`) and under `frontend/src/lib/**/__tests__`. Use for error classifiers, formatters, and dialog/banner behavior — e.g. indexer-catching-up UI without spinning up arkd.

## Frontend — Playwright (E2E)

Install browsers once: `cd frontend && npx playwright install`

```bash
cd frontend
npm run test:e2e              # default E2E suite
npm run test:e2e:headed       # visible browser
npm run test:e2e:ui           # Playwright UI mode
npm run test:e2e:sequential   # E2E_SEQUENTIAL=true
```

### Tagged suites

| npm script | Grep tag | Notes |
|------------|----------|--------|
| `test:e2e:regtest` | `@regtest` | On-chain regtest (clean stack) |
| `test:e2e:lab` | `@lab` | Lab SQLite flows |
| `test:e2e:arkade` | `@arkade` | Arkade mock |
| `test:e2e:arkade-regtest` | `@arkade-regtest` | REG-01/02, short VTXO expiry |
| `test:e2e:arkade-regtest-longexpiry` | `@arkade-exit-regtest` | REG-03/04, long expiry |
| `test:e2e:arkade-regtest-reg04` | `@arkade-reg04` | REG-04 only |
| `test:e2e:arkade-regtest-signer` | `@arkade-signer-regtest` | REG-05 signer migration |
| `test:e2e:nwc` | `@nwc` | NWC mock |

Contracts: `doc/features/arkade-regtest-contract.yaml` (E2E-ARK-REG-01 … 05).

### Background runner (Linux)

From repo root:

```bash
./scripts/run-e2e-background.sh
```

Runs the full E2E suite in the background and sends a desktop notification on success or failure.

## Arkade regtest (Docker)

Local stack for `@regtest` and `@arkade-regtest` flows. Detailed ports, expiry profiles, and troubleshooting:

**[frontend/tests/e2e/fixtures/arkade-regtest/README.md](frontend/tests/e2e/fixtures/arkade-regtest/README.md)**

```bash
# From repo root
bash scripts/start-arkade-regtest.sh
bash scripts/stop-arkade-regtest.sh

# From frontend/ — wipe volumes + boot (recommended before flaky runs)
npm run regtest:clean-start
```

Long-running flows (exit, signer migration) need `ARKD_VTXO_TREE_EXPIRY=200`; the npm scripts above set that via `regtest:clean-start`.

### E2E → Rust fixture bridge (REG-05)

Export boarded wallet persistence from E2E for Rust migration tests:

```bash
# from frontend/
ARKD_VTXO_TREE_EXPIRY=200 REQUIRE_ARKADE_REGTEST=1 VITE_E2E_ARKADE_REGTEST=true \
  ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE=1 \
  npx playwright test tests/e2e/arkade-signer-migration-regtest.spec.ts
```

Then run the Rust fixture test (from repo root) as in the table above. Use a path under the repo (e.g. `frontend/test-results/arkade-boarded-fixture.json`), not `/tmp`.

## Adding tests for a new feature

1. Add or extend a contract in `doc/features/` when behavior is user-visible or safety-critical.
2. **Happy path** → Playwright if it is a critical journey; otherwise Vitest if UI-only.
3. **Expected errors / invariants** → Rust (`bitboard-ark` unit or `*_regtest.rs`). Assert codes and persistence, not only message text.
4. **Error presentation** → Vitest on the component that surfaces the error.
5. Avoid a second regtest happy path if E2E already covers it; use fixtures to share expensive setup.

## TDD

When requirements are clear from the start, follow the red–green–refactor loop in `.cursor/rules/testing-strategy.mdc` and record progress in `.cursor/tdd-protocols/<task>.md`.

Backend-style “write HTTP integration tests first” applies when adding server APIs; this repo’s wallet logic is primarily tested via `crypto/`, `bitboard-ark/`, Vitest, and Playwright as above.
