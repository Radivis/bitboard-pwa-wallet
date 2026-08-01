# arkade-regtest Esplora quirks

The arkade-regtest stack ships a **minimal Esplora-compatible API** (mempool backend on port 7030). It is not identical to production Esplora or mempool.space. Wallet and test code must account for these differences or unilateral-exit flows (REG-04, REG-07) and other on-chain paths will misread chain state.

**Stack setup and E2E commands:** [frontend/tests/e2e/fixtures/arkade-regtest/README.md](../frontend/tests/e2e/fixtures/arkade-regtest/README.md)

**Implementation:** `bitboard-ark/src/esplora_blockchain.rs` (`EsploraBlockchain`, `map_tx_confirmations`, `find_tx_at`, `is_tx_relayed_on_network`).

---

## Three endpoints, three behaviors

For the same `txid`, regtest Esplora endpoints can disagree. Do not assume “visible on one endpoint ⇒ visible on all” or “relayed ⇒ same as confirmed.”

| Endpoint | Typical regtest behavior | Safe to use for |
|----------|--------------------------|-----------------|
| `GET /tx/{txid}/merkle-proof` | **404/500** when the tx is virtual-only or not yet on chain | Confirmation when present; treat missing as "not confirmed" (never fail the poll) |
| `GET /tx/{txid}/status` | Works for **confirmed** txs; may **404** for mempool txs | **Primary** confirmation depth (`map_tx_confirmations` main path) |
| `GET /tx/{txid}` (JSON) | Often available for **virtual-tree artifacts before relay**; may show `confirmed: false` indefinitely until mined | Loading tx bytes when raw is missing (`find_tx_at` fallback); **not** sole proof of relay |
| `GET /tx/{txid}/raw` | **404 for mempool txs** even after successful broadcast; works once confirmed on chain | Strict “on real network” check (`is_tx_relayed_on_network`) |

**Confirmed on regtest** usually means: `get_tx_status` succeeds and reports a block height — even when `/raw` still 404’d in mempool.

**Relayed on regtest** (`/raw` returns bytes) is a **stricter** predicate than “confirmed” and is **not** equivalent to “step complete.”

---

## Virtual-tree JSON before relay

The operator indexer can expose virtual unroll branch txs via JSON `/tx/{txid}` **before** those txs are accepted into the mempool (`/raw` still 404). That JSON is useful for building the next step but must not be treated as:

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

**Do not** require `is_tx_relayed_on_network` for step completion. Mined steps can be confirmed via `/status` while `/raw` never served them in mempool.

### Broadcast gating (unilateral `proceed`)

`is_tx_relayed_on_network` (**raw only**) is appropriate here:

- skip rebroadcast when the step tx is already on the network,
- tolerate RPC `-25` / “already in mempool” when raw shows the tx exists.

This is **not** a substitute for waiting on confirmations; the UI/automation runner polls progress separately.

### Loading transaction bytes (`find_tx_at`)

Try `/raw` first; fall back to JSON `/tx/{txid}` so commitment / virtual-tree txs remain loadable on regtest when raw 404s.

---

## Unilateral exit completion detection

Separate from step progress: detecting that the **final exit sweep** spent a VTXO.

**Pitfall:** each unroll CPFP step spends the previous branch tx at **`vout 0`**. Treating “anything spent `vout 0` of the branch tip” as exit completion causes false `is_spent` / “Finalized” UI without a completion tx.

**Rule:** completion probes must target the **actual virtual VTXO outpoint** `(leaf_txid, virtual_vout)`, not arbitrary branch-tip spends. See `detect_exiting_vtxo_completion_on_esplora` in `bitboard-ark/src/session/exit_onchain.rs`.

---

## Other regtest Esplora gaps

| Gap | Wallet handling |
|-----|-----------------|
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
