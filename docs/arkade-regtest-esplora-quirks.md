# arkade-regtest Esplora quirks

The arkade-regtest stack ships a **minimal Esplora-compatible API** on port 7030 (`MEMPOOL_WEB_PORT` in `.env.regtest`). Bitboard adds an **`esplora_gateway`** container ([`docker/esplora-gateway/`](../docker/esplora-gateway/)) in front of mempool's web UI: it serves `GET /tx/{txid}/raw` from bitcoind and proxies everything else to `mempool_web`. It is still not identical to production Esplora in every edge case. Wallet and test code must account for remaining differences or unilateral-exit flows (REG-04, REG-07) and other on-chain paths will misread chain state.

**Stack setup and E2E commands:** [frontend/tests/e2e/fixtures/arkade-regtest/README.md](../frontend/tests/e2e/fixtures/arkade-regtest/README.md)

**Implementation:** `bitboard-ark/src/esplora_blockchain.rs` (`EsploraBlockchain`, `map_tx_confirmations`, `find_tx_at`, `is_tx_relayed_on_network`).

---

## Three endpoints, three behaviors

For the same `txid`, regtest Esplora endpoints can disagree. Do not assume “visible on one endpoint ⇒ visible on all” or “relayed ⇒ same as confirmed.”

| Endpoint | Typical regtest behavior | Safe to use for |
|----------|--------------------------|-----------------|
| `GET /tx/{txid}/merkle-proof` | **404** from `esplora_gateway` (mempool returns **500**, which rust-esplora-client retries 6× and stalls progress polls) | Confirmation when present; treat missing as "not confirmed" (never fail the poll) |
| `GET /tx/{txid}/status` | Mempool electrum may keep `confirmed: false` for virtual-tree stubs even after mining; **`esplora_gateway` overrides with bitcoind when the tx is in a block** | **Primary** confirmation depth (`map_tx_confirmations` main path) |
| `GET /tx/{txid}` (JSON) | Often available for **virtual-tree artifacts before relay**; may show `confirmed: false` indefinitely until mined | Loading tx bytes when raw is missing (`find_tx_at` fallback); **not** sole proof of relay |
| `GET /tx/{txid}/raw` | **200** when bitcoind has the tx in **mempool or chain** (not wallet-only); **404** otherwise (`esplora_gateway`) | Strict “on real network” check (`is_tx_relayed_on_network`) |

**Confirmed on regtest** usually means: `get_tx_status` succeeds and reports a block height.

**Relayed on regtest** (`/raw` returns bytes) means bitcoind accepted the tx into mempool or chain. It is **not** equivalent to “step complete” (confirmations still gate `step_index`).

---

## Virtual-tree JSON before relay

The operator indexer can expose virtual unroll branch txs via JSON `/tx/{txid}` **before** those txs are accepted into bitcoind's mempool (`/raw` still 404). That JSON is useful for building the next step but must not be treated as:

- proof the tx was broadcast successfully,
- proof the tx has confirmations, or
- proof a unilateral-exit step is complete.

`map_tx_confirmations` handles this on the **404 or unconfirmed `/status`** path: require `/raw` before consulting JSON `/tx/{txid}` for confirmation depth, and prefer **merkle proof** when the tx is in a block. The happy path uses `/status` with `confirmed: true` directly.

**Pitfall:** `/status` may return **200 OK** with `confirmed: false` for a virtual-tree stub (not only 404). Treating that as final `0` confirmations without checking merkle proof or relayed `/raw` + JSON status breaks step progress after mining.

---

## Correct use of relay vs confirmation in wallet code

These rules are intentional; violating them has caused full-day regressions (REG-04 / REG-07 stuck at “Step 1 of N”).

### Step completion (unilateral unroll progress)

Use **confirmation depth** from `get_tx_status` / `tx_confirmations`:

- `first_incomplete_step_index`
- `current_step_waiting_since`
- `node_statuses_for_plan` / `node_status_label`
- leaf finality (`leaf_reached_finality`)

**Do not** require `is_tx_relayed_on_network` for step completion. Mined steps are confirmed via `/status` / merkle proof even if `/raw` was never polled during the mempool phase.

### Broadcast gating (unilateral `proceed`)

`is_tx_relayed_on_network` (**raw only**) is appropriate here:

- skip rebroadcast when the step tx is already on the network,
- tolerate RPC `-25` / “already in mempool” when raw shows the tx exists.

With `esplora_gateway`, `/raw` should return **200** shortly after a successful package broadcast. The persisted `current_step_waiting_since` stamp remains a causal fallback if Esplora is unreachable; it is not a substitute for `/raw` when the gateway is healthy.

This is **not** a substitute for waiting on confirmations; the UI/automation runner polls progress separately.

### Loading transaction bytes (`find_tx_at`)

Try `/raw` first; fall back to JSON `/tx/{txid}` so commitment / virtual-tree txs remain loadable on regtest when the tx is not yet in bitcoind's mempool.

---

## Unilateral exit completion detection

Separate from step progress: detecting that the **final exit sweep** spent a VTXO.

**Pitfall:** each unroll CPFP step spends the previous branch tx at **`vout 0`**. Treating “anything spent `vout 0` of the branch tip” as exit completion causes false `is_spent` / “Finalized” UI without a completion tx.

**Rule:** completion probes must target the **actual virtual VTXO outpoint** `(leaf_txid, virtual_vout)`, not arbitrary branch-tip spends. See `detect_exiting_vtxo_completion_on_esplora` in `bitboard-ark/src/session/exit_onchain.rs`.

---

## Other regtest Esplora gaps

| Gap | Wallet handling |
|-----|-----------------|
| `GET /tx/{txid}/raw` missing on stock mempool electrum API | Bitboard `esplora_gateway` serves `/raw` from bitcoind; ensure container `bitboard-regtest-esplora-gateway` is running on `MEMPOOL_WEB_PORT` |
| Browser WASM `Failed to fetch` on Esplora `/raw` (sync-error, topology errors) | `esplora_gateway` must send CORS headers on `/raw` responses (same as proxied mempool routes); rebuild/restart `esplora_gateway` after gateway code changes |
| REG-07 stuck at “Step 1 of N” after mining (`/raw` 200, `/status` still `confirmed: false`) | Rebuild `esplora_gateway` so confirmed `/status` comes from bitcoind; stale mempool electrum status alone must not gate `step_index` |
| REG-07 / progress polls hang for minutes (`checkingProgress`) | Rebuild `esplora_gateway` so `/merkle-proof` returns **404** immediately; mempool **500** triggers six esplora-client retries per node |
| `/fee-estimates` 404 | `map_fee_rate` falls back to `MIN_FEE_RATE_SAT_PER_VB` |
| `POST /txs/package` without `Content-Type: application/json` | arkade-regtest mempool returns generic `submitpackage` / `sendrawtransaction` RPC `-1`; vendored `esplora-client` sets the header on package submit |
| Address UTXO listings omit `block_time` | Vendored `coin_select` + status backfill; see [arkade-bitboard-wallet-model.md](arkade-bitboard-wallet-model.md) § unilateral exit completion coin-select |
| Indexer lag after `mine` | E2E helpers poll tip height / call `triggerArkadeRailSync`; see fixture README troubleshooting |

---

## Anti-patterns (do not reintroduce)

1. **Relay-gated step completion** — `unroll_step_is_complete_on_network`-style helpers that require `/raw` before advancing `step_index`. Breaks regtest after mining.
2. **JSON-only presence as confirmed** — using `/tx/{txid}` JSON alone (without `/status` or relay guard on the 404 path) for confirmation counts on virtual-tree txs.
3. **Stale `/status` unconfirmed** — returning `0` confirmations when `/status` is `200` with `confirmed: false` but the tx is in a block (use merkle proof or relayed JSON status).
4. **Blocking `proceed` in WASM** — removed in favor of non-blocking proceed + frontend/automation polling; if changing this, keep confirmation-based progress detection and retry broadcast when a step stays at 0 confirmations.
5. **E2E timeout inflation** — regtest failures from (1)–(3) look like “needs more mines / longer timeout”; fix Esplora semantics first (project rule: no E2E wait tinkering without explicit approval).

---

## Regression reference

When REG-04 / REG-07 stuck at “Step 1 of N” despite mining, compare orchestrator + `map_tx_confirmations` against commit `1792a24` (“Made E2E-ARK-REG-07 work”): confirmations on the primary path, relay gate only on broadcast decisions and the `/status` 404 fallback.

---

## Related tests

| Test | What it exercises |
|------|-------------------|
| E2E `@arkade-reg04` | Manual unilateral unroll + mining |
| E2E `@arkade-reg07` | Preconfirmed VTXO + automatic unroll |
| `bitboard-ark/tests/unilateral_exit_session_regtest.rs` | Native unroll + complete (Docker) |
| `cargo test -p bitboard-ark --lib` | Unit coverage for orchestrator helpers |

Contracts: `doc/features/arkade-regtest-contract.yaml` (REG-04, REG-07).
