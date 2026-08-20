# Unilateral exit: false confirmations vs `submitpackage` (agent handoff)

This is a **handoff**, not a closed RCA. Session `913f52` (Mutinynet, manual unroll, ~2026-08-16) spent days patching the XState machine. The remaining failure is **not** “the UI forgot which node the user is on.” It is: **Esplora reports a parent as confirmed (often 1+ confs) while the bitcoind behind `POST /txs/package` still rejects the child with `package-not-child-with-unconfirmed-parents`.**

Do **not** add a second cursor. Do **not** keep stacking XState guards. Confirm Esplora vs submit-node disagreement with runtime evidence, then gate `first_incomplete_step_index` on a truth that `submitpackage` shares.

Related handbook: [unilateral-exit.md](unilateral-exit.md). Esplora endpoint quirks (mostly **regtest**): [arkade-regtest-esplora-quirks.md](arkade-regtest-esplora-quirks.md). Ownership: [`.cursor/rules/unilateral-exit-xstate.mdc`](../.cursor/rules/unilateral-exit-xstate.mdc).

---

## Intended product (do not “fix” these)

| Invariant | Meaning |
|-----------|---------|
| Cursor is chain truth | `progress.stepIndex` **is** WASM `first_incomplete_step_index`: first tx in `ordered_step_txids` with **&lt; 1** confirmation (`UNILATERAL_EXIT_STEP_CONFIRMATIONS`). Reorgs that drop a tx to 0 conf **rewind**. |
| No client-side step cursor | A manual “acknowledged index” was implemented and **rejected**. It fights reorgs and duplicates chain state. |
| One user Proceed per **broadcast** | Manual mode: one click broadcasts **one** virtual parent + CPFP child via `submitpackage([parent, cpfp])`. Already-confirmed steps are skipped because they are confirmed, not because the UI walks them. |
| ASP-online is hostile | If the ASP is up it **will** publish checkpoint txs. That is protocol defense, not a Bitboard bug. Handbook: “If the ASP is still online, finish quickly.” |
| Unroll should be Esplora + local materials | Do not add ASP indexer calls on proceed/progress. Vendored ark-client still talks to the server on the cooperative path (`third_party/ark-client/src/unilateral_exit.rs` TODO). |

User-visible manual UX: overlay megaphone = broadcasting, pickaxe = waiting for confirm, play = ready to Proceed. Automation off unless the user opted in.

---

## User-visible failure (still open)

On Mutinynet, after Proceed on an Ark tx:

1. The graph **jumps** over a checkpoint (or shows that checkpoint as already confirmed).
2. The next Ark is offered as first-incomplete.
3. Proceed fails with: *“Previous unroll step is not confirmed on-chain yet. Wait for a confirmation, then proceed again.”*

That string is a remap of bitcoind/Esplora `package-not-child-with-unconfirmed-parents` (`UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE` in `frontend/src/lib/arkade/unilateral-exit-broadcast.ts`).

**This is not “the UI auto-broadcast the checkpoint.”** Logs show the wallet **did not** `submitpackage` the skipped checkpoint. `first_incomplete` **skipped** it because Esplora already assigned it ≥1 confirmation. The later `submitpackage` of the child then said that same parent was **unconfirmed**.

---

## Latest runtime evidence (session `913f52`, post-cursor-revert)

Job: 23 steps. User proceeded **step 17** Ark `c29490d5…` (spends checkpoint `3664e91a…`, which had 22–25 Esplora confs — real).

| Time (log `timestamp`) | What happened |
|------------------------|----------------|
| `…108625` | `ensureBroadcast` broadcasts step 17. `prevConf=25`, `currConf=0`. |
| `…120707` | WASM proceed: parent input `3664e91a…:0`. |
| `…199254` | After proceed: `beforeIndex=17`, **`afterIndex=19`**, `visible=true` (relay helper treats a jump as success). |
| `…206976` | UI idle on **step 19** Ark `91ffe892…`. Previous node checkpoint **`d1e8cf0a…` with `previousConf: 1`**. Step **18 skipped**. |
| `…255570` … `…424752` | Idle polls: Esplora confs for `d1e8cf0a` climb **1 → 3 → 4 → 6 → 7 → 8**. |
| `…439928` | Proceed step 19: parent input **`d1e8cf0a…:0`**. |
| `…440954` | **`packageNotChild: true`**. Esplora still reported `prevConf: 8`. |

So at fail time the wallet believed the parent had **8 confirmations**, and the package RPC still said **unconfirmed parents**.

Earlier in the same session (pre-cache-bust), `/blocks/tip/height` was **stuck** at `3348236` while `/status` claimed `block_height` `3348407` / `3348440`. `tip.saturating_sub(block)+1` then yielded **exactly 1 conf** whenever `tip < block`. That is a **second**, independent false-1-conf mechanism (stale tip). Mutinynet explorer later showed some of those checkpoints as actually mined; `submitpackage` still disagreed at click time.

Progress fetches often take **~25–35s** (23 txs × several HTTP calls). A single Proceed can therefore straddle ASP publish + Esplora “confirm” of later checkpoints.

---

## What was tried (keep / revert / still dirty)

### Keep (log-proven or independently correct)

| Change | Why |
|--------|-----|
| `mined_tx_confirmations`: if `tip < block_height` → **0**, not 1 | Stale tip used to mint fake 1-conf. Test: `mined_tx_with_block_height_ahead_of_tip_is_not_confirmed`. |
| Cache-bust `GET /blocks/tip/height?_={atomic}` in vendored `third_party/esplora-client` (`async.rs` / `blocking.rs`) | Tip was a cached HTTP response. |
| `Cache-Control: no-cache` on `EsploraBlockchain::new` | Same class of bug. |
| Topological `merge_exit_branch_txids` so **both** sibling checkpoints precede a merge Ark | Insertion-order merge swapped `682f8a6b` / `bfdc04c6`; Proceed targeted an **index** and jumped to the other checkpoint. Tests in orchestrator. |
| Manual broadcast requires `proceedRequested && feeRate`; leftover fee rate must not auto-broadcast | Prevents poll from calling `ensureBroadcast`. |
| Idle poll: `after pollDelay` + `POLL_TICK` → `progressRefreshRequested`, fetch only, no broadcast | `isProgressRefresh` → `idle`. |
| Overlay: if `progressRefreshRequested`, do **not** show megaphone / treat as advancing | Poll was painted as broadcasting. |
| `unilateralExitSnapshotIsProceeding` false when `progressRefreshRequested` | Same. |
| `PROCEED_MANUAL` accepted in `checkingProgress` / `loadingProgress` (`assignProceedManual` only, do not cancel invoke) | After making the button live during poll, clicks were **dropped** (no `PROCEED_MANUAL` handler). Logs: zero `proceedRequested:true` until this fix; then `H-drop` with `progressRefreshRequested:true` at step 17. |
| `broadcastedStepIsVisibleOnNetwork`: if `stepIndex` advanced, treat the **broadcasted** tx as visible | After a jump, checking relay on the **new** unpublished Ark threw “not visible on the network after broadcast.” |
| `package-not-child-…` remapped to the wait-and-retry message | UX only; does not fix the skip. |
| `finalize_unilateral_exit_tree` must finalize **every** input | Empty-witness broadcast bug (separate). |
| Job complete requires `progress.phase === 'complete'` and leaves unrolled | False complete (separate). |

### Reverted (rejected by product)

| Change | Why rejected |
|--------|----------------|
| `manualAcknowledgedStepIndex` / `progressHeldAtManualFocus` / “Proceed acknowledges without broadcast” | Second cursor. Breaks reorg rewind. Extra complexity. Files deleted. |

### Harmful and already removed from hot path

Extra HTTP **inside** `first_incomplete_step_index` and **before** `submitpackage` (`debug_confirmation_snapshot`: `/status`, JSON, tip, merkle/block, `/raw`). Proceed took ~90s; ASP+chain ran ahead. Do **not** put multi-GET snapshots on the proceed path.

Session ingest (`fetch` to `127.0.0.1:7757`, Rust `agent_debug_log`) was removed after the fix. Do **not** reintroduce snapshot HTTP on the proceed path.

`mined_tx_confirmations` fails closed when the tip is missing: `(Some(_), None) => 0`.

---

## Confirmed / rejected hypotheses

| ID | Hypothesis | Verdict |
|----|------------|---------|
| Stale tip → fake 1-conf | Cached `/blocks/tip/height` + `saturating_sub` | **Confirmed** (earlier run). Partial fix landed. **Not sufficient** (latest run still skips + `package-not-child` at Esplora conf=8). |
| Sibling checkpoint index swap | `ordered_step_txids` not topological | **Confirmed** for one jump. Topo merge landed. Latest skip is **sequential** 17→19, not a swap. |
| UI auto-`submitpackage` of later steps | Poll/`ensureBroadcast` without click | **Rejected** for the latest skip. `ensureBroadcast` ran once for step 17; next broadcast was step 19 after a new click. |
| Overlay cycle = extra broadcasts | Megaphone during idle poll | **Confirmed as overlay-only**. Fixed with `progressRefreshRequested`. |
| “Not visible after broadcast” | Relay check on new `first_incomplete` | **Confirmed**. Helper treats jump as visible. |
| Proceed dead | `PROCEED_MANUAL` dropped in `loadingProgress` | **Confirmed**. Handler added. |
| Manual cursor needed so user clicks every graph node | — | **Rejected by human.** Chain truth is the cursor. |
| Esplora conf depth == submitpackage bitcoind | Same URL ⇒ same mempool/chain | **Rejected by latest logs.** Esplora `prevConf=8`, RPC `package-not-child-with-unconfirmed-parents`. |

---

## Primary remaining RCA (work this, not XState)

`first_incomplete_step_index` uses `tx_confirmations` → `map_tx_confirmations` → `/tx/{txid}/status` (`confirmed` + `block_height`) then `tip - height + 1`.

`proceed` broadcasts with `EsploraBlockchain::broadcast_package_at` → Esplora `POST /txs/package` → **that** backend’s bitcoind `submitpackage`.

Those two views can diverge:

1. **Indexer vs submit bitcoind** — Mutinynet public Esplora (mempool.space / electrs) can mark a tx confirmed (or serve a stub `/status`) while the node that handles `/txs/package` still has the parent unconfirmed or missing.
2. **Virtual-tree JSON/`/status` lies** — documented for **regtest** in `arkade-regtest-esplora-quirks.md`: `/status` `confirmed: true` without `/raw`; JSON `/tx` exists before relay. Mutinynet may have an analogue when the ASP publishes a checkpoint the indexer knows and bitcoind does not (yet).
3. **`confirmed: true` with no usable tip** — `mined_tx_confirmations(Some(_), None) => 1`.
4. **`in_best_chain` never checked** on the hot path (only in a removed debug snapshot).
5. **ASP publishes checkpoint `d1e8cf0a`** while the wallet is still in the ~30s proceed of the previous Ark. Esplora indexes it as 1-conf immediately; wallet skips it; child package is rejected.

Treat (1)+(2)+(5) as the default explanation until a dual-read proves otherwise.

---

## Proposed approaches (pick with evidence, don’t stack)

### A. Gate step-complete on submit-node truth (preferred direction)

Before treating a tx as ≥1 conf for `first_incomplete`:

- Require `/tx/{txid}/raw` **200** (already used for relay, **not** for step-complete today — see quirks doc pitfall), **and**
- Require a confirmation signal the submit backend shares: merkle proof, or `gettxout` / equivalent, or a **probe package** / `testmempoolaccept` of a dummy child (heavy), or
- On Mutinynet: confirm whether `/tx/status` and `/txs/package` hit the **same** bitcoind. If not, stop using explorer `/status` for unroll gating.

Do not require `/raw` alone for “step complete” on **regtest** without reading the quirks doc (mined txs can confirm via `/status` while `/raw` was never polled). Mutinynet may differ — **measure**.

### B. Do not skip a step this wallet never broadcast unless the parent is spendable

If step N was not submitted by this proceed, and N+1 would spend N: keep `first_incomplete` at N until `submitpackage` of a child would not return `package-not-child-…` (or until `/raw` + mempool/chain on the **submit** node).

This still follows chain truth, but defines “confirmed” as **spendable as a package parent**, not “Esplora painted a block height.”

### C. On `package-not-child`, rewind instead of only toasting

If Esplora says parent has confs and submitpackage disagrees, **do not** leave `first_incomplete` on the child. Force progress back to the parent (0 conf from the wallet’s point of view) and show play on that checkpoint. That matches reorg semantics: unconfirmed parent ⇒ rewind.

This is a recovery path, not a substitute for (A)/(B).

### D. Speed up `getUnilateralExitProgress`

Walking all `ordered_step_txids` with multiple HTTP calls makes every poll/proceed 15–35s. That is a **multiplier** for ASP races. Cache per-txid confirmation until a new block (`get_height` change) or cap probes to the prefix until the first 0-conf. Do not add debug snapshots.

### E. Instrumentation to run next (cheap)

On `first_incomplete` when a tx first reaches ≥1 conf, log **without** extra round-trips beyond what you already have, or **one** extra GET:

- `txid`, `/status` `{confirmed, block_height, block_hash}`
- `get_height` result
- `/raw` present?
- `/block/{hash}/status` `in_best_chain` if hash present

On `broadcast_package_at` **failure** `package-not-child`, log parent txids and the **same** fields for each parent. Compare Esplora vs the error. Do **not** snapshot every input before every successful submit (that was the 90s regression).

Manually: open Mutinynet explorer + the wallet’s configured Esplora URL for `d1e8cf0a3cc64d1477c96c5ceb929c2eeb1c986727fd2f75d140303994da60c6` at fail time; check whether `/txs/package` is proxied to the same stack.

### F. Do not do

- Another XState “don’t jump the graph” cursor.
- Sleeping/retrying Proceed to wait for “real” confs as the primary fix.
- Treating explorer 1-conf as sufficient to skip a checkpoint the bumper has not spent as parent.
- Re-adding hot-path confirmation snapshots.

---

## Code map

| Piece | Path |
|-------|------|
| `first_incomplete_step_index` | `bitboard-ark/src/session/unilateral_exit_orchestrator.rs` |
| `map_tx_confirmations` / `mined_tx_confirmations` / `broadcast_package_at` | `bitboard-ark/src/esplora_blockchain.rs` |
| `get_height` cache-bust | `third_party/esplora-client/src/async.rs`, `blocking.rs` |
| Machine poll / proceed | `frontend/src/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine.ts` |
| `ensureBroadcastActor` | `…/unilateral-exit.actors.ts` |
| Overlay / proceeding | `…/unilateral-exit-selectors.ts`, `…/unilateral-exit-snapshot.ts` |
| Package error remap | `frontend/src/lib/arkade/unilateral-exit-broadcast.ts` |
| Mutinynet Esplora URL | `frontend/src/lib/arkade/arkade-endpoints.ts` / `getEsploraUrl` |

WASM: after Rust changes, `cd frontend && npm run build:wasm` (or ark crate only). Hard-refresh; the worker caches `.wasm`.

---

## Suggested next agent prompt

> Mutinynet unilateral exit: Esplora reports checkpoint `d1e8cf0a…` as 1–8 confs so `first_incomplete` skips it; `submitpackage` of the next Ark then returns `package-not-child-with-unconfirmed-parents`. Read `docs/unilateral-exit-false-confirmation-rca.md`. Do not add a UI cursor. Prove whether `/tx/status` and `/txs/package` share a bitcoind, then gate `first_incomplete_step_index` on spendability as a package parent. Keep existing tip-inversion and topo-merge fixes. Strip leftover debug ingest after the gate is proven.
