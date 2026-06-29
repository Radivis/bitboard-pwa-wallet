# arkade-regtest E2E fixtures and scenario notes

Local [arkade-regtest](https://github.com/ArkLabsHQ/arkade-regtest) stack for `@regtest` on-chain tests and `@arkade-regtest` Arkade core flows.

## Ports (host)

| Service | URL |
|---------|-----|
| Esplora REST API | `http://localhost:7030/api` |
| Mempool web UI (optional) | `http://localhost:7030` |
| arkd operator | `http://localhost:7070` |

Configured in repo-root [`.env.regtest`](../../../../.env.regtest) (`MEMPOOL_WEB_PORT=7030`).

## Start / stop

```bash
# From repo root
bash scripts/start-arkade-regtest.sh   # compose up + health wait
bash scripts/stop-arkade-regtest.sh

# From frontend/
npm run regtest:clean-start   # wipe volumes + compose up + health wait
npm run test:e2e:regtest
npm run test:e2e:arkade-regtest             # REG-01/02 (recovery, renewal) — short expiry
npm run test:e2e:arkade-regtest-longexpiry  # REG-03/04 (collaborative exit, unilateral unroll) — long expiry
npm run test:e2e:arkade-regtest-reg04       # REG-04 only — clean stack + long expiry (isolated debugging)
```

## Two stacks: short vs long VTXO expiry

The Arkade regtest flows split into two suites that need **opposite** VTXO lifetimes, so each boots the
same stack with a different (block-denominated) `ARKD_VTXO_TREE_EXPIRY`:

| Suite | Spec | Tag (`--grep`) | Expiry | Tests |
|-------|------|----------------|--------|-------|
| Short | `arkade-core-flows-regtest.spec.ts` | `@arkade-regtest` | `.env.regtest` default (`40` blocks) | REG-01 recoverable recovery, REG-02 renewal |
| Long  | `arkade-exit-flows-regtest.spec.ts` | `@arkade-exit-regtest` | `ARKD_VTXO_TREE_EXPIRY=200` blocks (set by the npm script) | REG-03 collaborative exit, REG-04 unilateral unroll |

Recovery/renewal need VTXOs to expire/become recoverable quickly; collaborative exit and unilateral
unroll need a VTXO that stays live through a multi-step on-chain flow (these mine only ~20 blocks, well
under 200). Running the long-expiry script re-creates the `arkd` container with the larger expiry
(Docker Compose recreates on env change); running the short script again restores the `.env.regtest`
value.

> **arkd locktime-type constraint:** arkd rejects a config where the delays straddle 512 — *all* of
> `ARKD_VTXO_TREE_EXPIRY`, `ARKD_UNILATERAL_EXIT_DELAY`, `ARKD_CHECKPOINT_EXIT_DELAY`, etc. must be on
> the same side (`<512` block-type, or `≥512` seconds-type). The long-expiry value therefore stays a
> block count `<512` rather than a large seconds value, so the other (small) delays stay valid and
> REG-04's complete-step still satisfies its `ARKD_UNILATERAL_EXIT_DELAY` by mining 20 blocks.

## Block-denominated VTXO timing

`.env.regtest` sets `ARKD_VTXO_TREE_EXPIRY=40` and `AUTOMINE_INTERVAL=0`. Mine explicitly via `node regtest/regtest.mjs mine N` or Playwright helpers.

| Scenario | Blocks to mine (after boarding) | Helper constant |
|----------|--------------------------------|-----------------|
| Recoverable VTXO recovery | 41 | `ARKADE_REGTEST_RECOVERABLE_MINE_BLOCKS` |
| VTXO renewal (soon) | 35 | `ARKADE_REGTEST_RENEWAL_SOON_MINE_BLOCKS` |
| Unilateral complete timelock | 20 after unroll | `ARKADE_REGTEST_UNILATERAL_EXIT_DELAY_BLOCKS` |

## Wallet

E2E uses `TEST_MNEMONIC` from [`helpers/wallet-setup.ts`](../helpers/wallet-setup.ts) for deterministic keys.

## Troubleshooting

- **Container name conflict** (`postgres`, `bitcoin`, … already in use): Bitboard loads [`docker/arkade-regtest.override.yml`](../../../../docker/arkade-regtest.override.yml) and sets `ARKADE_REGTEST_CONTAINER_PREFIX=bitboard-regtest-` in `.env.regtest`, so stack containers are named e.g. `bitboard-regtest-postgres` (your standalone `postgres` container is untouched).
- **Health timeout**: cold Docker pull can take 1–3 minutes on CI; increase `ARKADE_REGTEST_HEALTH_TIMEOUT_MS`.
- **Port 7030 in use**: change `MEMPOOL_WEB_PORT` in `.env.regtest`.
- **Flaky Esplora index**: helpers poll tip height after `mine`; run `triggerArkadeRailSync` after chain advances.
- **Recoverable banner never appears / boarding settle fails**: repeated E2E runs on the same deterministic wallet leave many boarding UTXOs at the same address. After ~30 regtest blocks (`ARKD_BOARDING_EXIT_DELAY=30`), cooperative settle is rejected (`INVALID_PSBT_INPUT … expired`). Reset the stack before a clean run: `node regtest/regtest.mjs clean && node regtest/regtest.mjs start --profile ark` (or restart from repo root via `scripts/start-arkade-regtest.sh` after `clean`).
- **Boarding settle must be fast**: with block-denominated `ARKD_BOARDING_EXIT_DELAY=30`, arkd still applies a **~30 second** wall-clock cooperative window (`validateBoardingInput` uses `exitDelay.Seconds()` as seconds). Fund → settle within ~25s; the E2E helper enforces this.
- **`Timed out waiting … from config.webServer`**: Playwright waits for Vite on **`http://127.0.0.1:3100`** (not port 3000). E2E Vite binds to `127.0.0.1` explicitly so IPv6-only `localhost` does not cause a silent hang. The `scripts/e2e-dev-server.mjs` wrapper logs probe progress every 5s. `globalSetup` only checks Docker (Esplora + arkd), not Vite.

  ```bash
  # Terminal 1
  E2E_DEV_SERVER_PORT=3100 VITE_E2E_ARKADE_REGTEST=true VITE_ARKADE_OPERATOR_REGTEST=http://localhost:7070 npm run dev

  # Terminal 2 (stack already up)
  REQUIRE_ARKADE_REGTEST=1 VITE_E2E_ARKADE_REGTEST=true npm run test:e2e -- --grep @arkade-regtest
  ```

Contracts: [`doc/features/arkade-regtest-contract.yaml`](../../../../doc/features/arkade-regtest-contract.yaml)
