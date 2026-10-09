# Bark live-stack coverage, following Arkade

Planning note. Nothing in this document is implemented. It describes how to give Bark the same kind of integration and end-to-end coverage Arkade already has: a local server you can reset and mine, Playwright for the critical happy paths, and native Rust tests for fail-fast invariants.

Bark’s feature contract in [doc/features/bark.yaml](../../doc/features/bark.yaml) is already implemented by Vitest and in-crate unit tests. Those stay. This note is only the missing live-server layer.

Related:

- Arkade contract: [doc/features/arkade-regtest-contract.yaml](../../doc/features/arkade-regtest-contract.yaml)
- How the layers are split: [TESTING.md](../../TESTING.md) and `.cursor/rules/testing-strategy.mdc`
- Stack the Arkade suites boot: [frontend/tests/e2e/fixtures/arkade-regtest/README.md](../../frontend/tests/e2e/fixtures/arkade-regtest/README.md)
- Bark product behavior: [doc/features/bark.yaml](../../doc/features/bark.yaml)
- Bark session is wasm-only: `bitboard-bark/src/lib.rs` (`session` is `target_arch = "wasm32"`)
- Bark is its own Cargo workspace: root `Cargo.toml` `exclude = ["bitboard-bark"]`

---

## What to copy

Arkade does not prove one scenario twice. Playwright proves the user journey succeeds against a real operator. Rust regtest proves that when the operator or the chain misbehaves, the wallet fails without a false success and without rewriting persistence. Vitest proves how an error is shown. A boarded wallet can be exported once from Playwright and reused by Rust so the expensive setup is not repeated.

Bark should use that same split. The pieces, and the Bark-shaped counterparts:

| Arkade piece | Role | Bark counterpart |
|--------------|------|------------------|
| `regtest/` submodule (`arkade-regtest`) plus `scripts/start-arkade-regtest.sh`, `stop`, `clean`, `wait-arkade-regtest-health.sh` | Resettable bitcoind, Esplora, and operator. Faucet and `mine` from `regtest/regtest.mjs` | The same chain and Esplora (`:7030`). Add `captaind` as its own compose profile on that project. See [captaind on this stack](#captaind-on-this-stack) |
| `REQUIRE_ARKADE_REGTEST=1` in `frontend/tests/e2e/global/arkade-regtest-global-setup.ts` | Playwright refuses to start until the stack is healthy | `REQUIRE_BARK_REGTEST=1` on the same global setup, as a second gate. The Arkade wait stays |
| `VITE_E2E_ARKADE_REGTEST=true` and `test.skip` unless it is set | Specs do not run inside the default E2E suite | `VITE_E2E_BARK_REGTEST=true`, same skip |
| `npm run test:e2e:arkade-regtest` and the long-expiry / single-contract scripts in `frontend/package.json` | `regtest:clean-start`, then `playwright test --grep` | `test:e2e:bark-regtest` (and a second script only if one flow needs a different server expiry than the others) |
| `doc/features/arkade-regtest-contract.yaml` (`E2E-ARK-REG-01` … `07`) | One id per live journey, tagged to a grep | `doc/features/bark-regtest-contract.yaml` |
| Serial `test.describe`, 10-minute timeout, fresh wallet, operator restart in `beforeEach` (`arkade-core-flows-regtest.spec.ts`) | One shared stack; a stuck round does not poison the next test | Same shape under `frontend/tests/e2e/`. Restart the Bark server between tests |
| Scenario helpers in `frontend/tests/e2e/helpers/arkade-regtest-scenarios.ts` | Fund, mine, board, then the spec only clicks the user control | `bark-regtest-scenarios.ts`: fund the on-chain wallet, board or pay, mine confirmations, open the Bark page |
| `#[ignore]` tests in `bitboard-arkade/tests/*_regtest.rs`, `ARKADE_REGTEST_RUN=1`, `--test-threads=1`, a process-wide mutex | Opt-in, serial, shared Docker | `bitboard-bark/tests/*_regtest.rs`, `BARK_REGTEST_RUN=1`, same serial rule. Run from `bitboard-bark/` (`cargo test -p bitboard-bark` is not a root-workspace package) |
| `bitboard-arkade/tests/support/regtest_integration.rs` | Endpoints, faucet, mine, open session, fixture path | `bitboard-bark/tests/support/regtest_integration.rs` |
| `ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE` → `frontend/test-results/arkade-boarded-fixture.json` | Playwright writes persistence; Rust loads it and skips boarding | Export `{ mnemonic, recordDump }` after a successful board. Rust opens that dump. Details under [Fixture](#fixture) |

`@arkade` (mock ASP, `VITE_E2E_ARKADE_MOCK`) is a separate, server-less suite. Bark’s banners, session screens, VTXO cards, and history labels are already Vitest contracts in `bark.yaml`. A mock Playwright suite is not part of this replication.

Public Signet and Mainnet reachability (`bitboard-bark/tests/signet_reachability.rs`, `mainnet_reachability.rs`) stay as ignored smoke checks. They cannot mine, reset, or stop the server, so they are not this suite.

---

## What blocks a straight copy

Three Arkade assumptions are false for Bark today.

**There is no Bark server in this repo.** Arkade vendors [arkade-regtest](https://github.com/ArkLabsHQ/arkade-regtest) as the `regtest/` submodule. Bark talks to Second’s public endpoints (`BARK_SIGNET_SERVER_URL` / `BARK_MAINNET_SERVER_URL` in `bitboard-bark/src/lib.rs`). The published `bark-wallet` 0.7.1 crate does not ship the server. The chain and Esplora are already here. The missing process is [captaind](#captaind-on-this-stack), Second’s Ark server. Do not point these tests at `https://ark.signet.2nd.dev`.

**The product session does not open on regtest.** `isBarkNetworkMode` is signet or mainnet (`frontend/src/lib/bark/bark-utils.ts`). `bark_open_session` maps those two networks onto the public URLs (`bitboard-bark/src/session.rs`). Arkade already has `NetworkMode::Regtest` and local URLs. A live Bark suite needs a test-only open: bitcoin regtest, plus the local server URL and Esplora URL from the Vite flag. The settings screen can keep offering Signet and Mainnet only. The flag is `VITE_E2E_BARK_REGTEST`, checked the same way `isE2eArkadeRegtestControlEnabled` checks `VITE_E2E_ARKADE_REGTEST` in `frontend/src/lib/arkade/e2e/e2e-arkade-regtest-control.ts`: dev build and the flag, nothing else.

**`Wallet` is not linked into native `bitboard-bark`.** `session`, `board`, `arkoor`, and `collaborative_exit` compile only for `wasm32`. Native dev-dependencies pull `bark-wallet` with default features off, for the record store. Arkade’s `ArkadeSession` is an `rlib` the regtest tests call directly. Bark’s native tests should open `bark::Wallet` in the test binary, with `native` and `sqlite` (or the in-memory `SharedRecordStore` in `bitboard-bark/src/record_store.rs`) as **dev-dependencies**. That does not change the wasm-pack feature set. The wasm exports stay the product API.

`bitboard-bark` is a separate workspace because the parent lockfile unifies `bitcoin-units` to a version `bark-wallet` 0.7.1 cannot build. Regtest tests live inside `bitboard-bark/` so they keep that resolution. They do not join the root `cargo test` run.

---

## Playwright journeys

One contract id per happy path. Specs assert what the user sees after the stack has done its work. Scenario helpers own funding and mining.

| Id | Journey | Assert | Arkade analogue |
|----|---------|--------|-----------------|
| `E2E-BARK-REG-01` | Enable Bark, unlock, peek a receive address, pay it, sync | Dashboard Bark spendable shows the payment. On-chain total and Arkade total are unchanged | Balance after board, inside the Arkade scenarios |
| `E2E-BARK-REG-02` | Board from the on-chain wallet | Review shows the fees and the net VTXO. Confirm submits through Bark. After confirmations and a sync, spendable includes the board | Boarding setup for every Arkade regtest spec |
| `E2E-BARK-REG-03` | Arkoor send to a second Bark wallet on the same server | Sender spendable drops. Recipient, after sync, shows the payment | No dedicated Arkade id; closest is an offchain send |
| `E2E-BARK-REG-04` | Collaborative exit of part of the balance, and of the whole spendable balance, to the current on-chain receive address | On-chain balance gains the exited amount. The page does not ask for an address | `E2E-ARK-REG-03` |
| `E2E-BARK-REG-05` | Emergency exit of a selected VTXO: review, start, progress (mine between steps), claim to the current receive address | The exit tree follows the coins. Claimed funds arrive on-chain. The movement is a Bark emergency exit, distinct from the collaborative exit | `E2E-ARK-REG-04`, with Bark’s exit manager instead of the unilateral-exit machine |
| `E2E-BARK-REG-06` | Sync when coins are due for refresh | The dashboard shows the scheduled or pending refresh notice, and the spendable amount stays | `E2E-ARK-REG-02` |

Leave these Arkade contracts out. Bark does not have those features:

- `E2E-ARK-REG-05` signer migration
- `E2E-ARK-REG-06` operator trust / autonomous review
- `E2E-ARK-REG-07` preconfirmed chained self-sends and automatic unroll

`E2E-BARK-REG-05` and `E2E-BARK-REG-06` may need a longer VTXO lifetime than receive and board, the way Arkade boots `ARKD_VTXO_TREE_EXPIRY=40` for recovery and `200` for exits. Split the npm script when a single server config cannot host both. Name the Second config knobs in the contract file once they are known; do not reuse `ARKD_*`.

Spec layout, matching the Arkade files:

- `frontend/tests/e2e/bark-core-flows-regtest.spec.ts` — `01`, `02`, `03`. Tag `@bark-regtest`.
- `frontend/tests/e2e/bark-exit-flows-regtest.spec.ts` — `04`, `05`, and `06` if it shares that server config. Tag `@bark-exit-regtest`.
- Helpers next to `frontend/tests/e2e/helpers/arkade-regtest.ts`: block counts, `mine`, faucet, health.
- Serial mode, timeout on the order of `ARKADE_REGTEST_TIMEOUT_MS` (600s). Each test creates a new wallet. `beforeEach` restarts the Bark server.
- `test.skip` unless `VITE_E2E_BARK_REGTEST=true`.

On-chain regtest (`@regtest`) already funds and mines through the arkade-regtest Esplora. Bark boarding spends that on-chain wallet, so captaind has to watch that same bitcoind. The wallet then syncs the board through the Esplora already on `:7030`.

---

## captaind on this stack

`arkd` cannot host Bark. Arkade’s client speaks `ark-grpc` / `ark-rest`. `bark-wallet` 0.7.1 speaks `bark-server-rpc` (gRPC, and gRPC-Web in the browser). Those are different servers. Extending arkd, or pointing the Bark worker at `:7070`, does not produce a Bark session.

Running **captaind beside arkd, on the bitcoind this stack already runs**, does. Second’s own regtest compose ([`contrib/docker/docker-compose.yml`](https://gitlab.com/ark-bitcoin/bark/-/blob/master/contrib/docker/docker-compose.yml), image `secondark/captaind`) is a separate bitcoind with no Esplora. This app’s Bark session is configured with an Esplora URL (`bitboard-bark/src/session.rs`), and boarding spends the BDK wallet that syncs the arkade-regtest Esplora. Reusing that chain is the setup that makes a board visible to both sides.

What already matches:

| captaind needs | arkade-regtest already has |
|----------------|----------------------------|
| regtest bitcoind, RPC on `:18443`, `txindex=1` | `regtest/docker/compose.base.yml` (`rpcuser=admin1`, `txindex=1`, `blockfilterindex=1`) |
| An Esplora the wallet can query | `esplora_gateway` on `:7030` |
| Faucet and `mine` | `regtest/regtest.mjs` |
| gRPC-Web for the WASM worker | captaind has served `tonic_web` with permissive CORS since the Bark WASM work. The worker can call `http://localhost:3535` from the dev server |
| Postgres | The image carries its own data volume. Leave the stack’s `arkd` database alone |

Add captaind in the parent override (`docker/arkade-regtest.override.yml`) or a sibling compose file the existing `regtest/lib/compose.mjs` already merges. Give it a `bark` profile so `regtest.mjs start --profile ark` does not boot it. Arkade suites stay as they are. Bark scripts start `base` + `ark` + `bark`.

Keep these constraints:

- **Pin the image to the bark 0.7.1 release**, not `secondark/captaind:latest`. The client handshake rejects a server outside protocol versions 4 through 5 (`bark-server-rpc` 0.7.1). `latest` tracks Second’s master and will drift.
- **Fund captaind’s round wallet** before the first board, the same way the stack funds arkd. Health is “RPC answers and the round wallet has coins,” not only a listening port. Default public RPC is `:3535`.
- **Leave Core Lightning out** until a test pays a Lightning invoice. Second’s sample compose adds CLN for that. Board, Arkoor, refresh, and exit do not need it.
- **Do not leave captaind running during Arkade suites.** Both operators publish into one mempool. A captaind round or sweep can land in a block an Arkade test just mined. Stop or omit the `bark` profile for `@arkade-regtest`.
- **Confirm `coinstatsindex`.** Second’s sample bitcoind sets it; this stack does not. If captaind refuses to start without it, add that one `BITCOIN_EXTRA_ARGS` line and clean the volume. `txindex` and `blockfilterindex` are already on.
- **Esplora quirks still apply** to emergency exit. [docs/arkade-regtest-esplora-quirks.md](../arkade-regtest-esplora-quirks.md) is about this gateway, not about arkd.

Restart between Bark tests stops the `captaind` container, the way Arkade tests restart `arkd`. Mining stays `regtest.mjs`.

---

## Rust regtest

Happy paths stay in Playwright. Rust gets the cases where a green toast or a new sync stamp would be a bug.

Gate every test with `#[ignore]` and `BARK_REGTEST_RUN=1`, and take one mutex for the file, as `signer_migration_session_regtest.rs` does with `REGTEST_INTEGRATION_LOCK`. `--test-threads=1`.

| Test | Invariant |
|------|-----------|
| Sync while the server is stopped | `bark` sync returns an error. The record dump bytes are unchanged. No success stamp is written by this call (the stamp itself remains the frontend’s job, already covered by `BARK-SYNC-02`) |
| Board submission rejected | The on-chain wallet still holds the inputs. The dump has no settled VTXO for that attempt |
| Offboard while the server is stopped | The call fails. A later open of the same dump still has the pre-exit spendable VTXOs |
| Exit input the server names as already spent | That VTXO is recorded spent once, and the offboard checkpoint is dropped, so a retry cannot select it. The unit form is `BARK-EXIT-12`; this test is the live server inducing the rejection |
| Emergency-exit claim broadcast, then the process stops before Bark observes it | Re-opening the dump does not drain those VTXOs again. The unit form is `BARK-EMG-16` |

Assert error codes or dump contents. Avoid asserting user-facing message substrings.

Native open belongs in the test support module: mnemonic, regtest, local URLs, `SharedRecordStore` loaded from a dump (empty dump for a fresh wallet). It is not a new wasm export and it does not grow `bark_open_session`.

### Fixture

Arkade’s boarded fixture works because browser and native tests share one persistence JSON. Bark’s browser persistence is the base64 `Record` dump from `SharedRecordStore::export_encoded_dump`. A Rust test can load that dump only if it opens `bark::Wallet` on that same store.

Export from the dev-only page hook, after board and flush:

- mnemonic
- `recordDump` (the string `bark_export_record_dump` already returns)

Write it under `frontend/test-results/bark-boarded-fixture.json`. Rust reads `BARK_REGTEST_BOARDED_FIXTURE`, resolving repo-relative paths from the repo root the way `resolve_regtest_fixture_path` does (cargo’s cwd is `bitboard-bark/`).

Use the fixture for invariants that need funds and should not board again. Tests that need a fresh wallet, or a server that is down before any round, board themselves or start empty.

The encrypted SQLite flush (`BARK-DUR-*`) stays in Vitest and `record_store.rs`. Rust regtest checks the dump the wallet would hand to that flush. It does not open the app database.

---

## What not to rebuild

These `bark.yaml` groups already have an `implemented_by` test and do not need a live server:

- Dashboard and session screens (`DASH-BARK-*`, `BARK-SESS-*`)
- Sync gating, periodic policy, refresh scheduling rules (`BARK-SYNC-*`)
- Metadata stamps and record durability (`BARK-META-*`, `BARK-DUR-*`)
- Board, exit, send, and emergency-exit UI and the mocked worker calls (`BARK-BOARD-*`, `BARK-EXIT-*`, `BARK-SEND-*`, `BARK-EMG-*` except the live rows in the tables above)
- VTXO list presentation (`BARK-VTX-*`)
- History labels (`BARK-HIST-*`)

When a live test and a Vitest test could both mention “failed board”, the live test owns chain and dump state. The Vitest test owns the toast, the banner, and the unchanged spendable figure on screen.

---

## Order of work

1. **captaind profile** on the existing arkade-regtest chain, pinned to bark 0.7.1, funded, and absent from Arkade-only runs. Document port `:3535` and the expiry knobs in `frontend/tests/e2e/fixtures/bark-regtest/README.md`.
2. **Test-only session open.** Regtest network and local URLs behind `VITE_E2E_BARK_REGTEST`. Product Signet and Mainnet URLs stay hardcoded.
3. **Contract file** with the six ids, tags, and the Rust test names once they exist.
4. **One Playwright path**, `E2E-BARK-REG-02` or `01`, including the fixture export. That proves the stack, the worker, and the dump round-trip.
5. **The other happy paths**, split by server config if expiry requires it.
6. **Rust invariants**, starting with “server stopped, dump unchanged”, then the fixture-backed exit and claim cases.
