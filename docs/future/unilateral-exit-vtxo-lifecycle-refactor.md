# Unilateral exit: VTXO lifecycle refactor

Target architecture for treating **each VTXO in a unilateral exit** as a first-class lifecycle, instead of inferring that lifecycle from a frontend job plus scattered WASM flags.

This is the planning parent. Each stage gets its own implementation plan (and TDD protocol) later. Do not implement multiple stages in one PR.

Related:

- Current protocol / job machine: [unilateral-exit.md](unilateral-exit.md)
- Current persistence shards: [persistence/unilateral-exit.md](persistence/unilateral-exit.md)
- Balance buckets: [arkade-bitboard-wallet-model.md](arkade-bitboard-wallet-model.md)
- Job XState ownership: [`.cursor/rules/unilateral-exit-xstate.mdc`](../.cursor/rules/unilateral-exit-xstate.mdc)
- Test contracts: `ARK-EXIT-*` in [doc/features/arkade.yaml](../doc/features/arkade.yaml)

---

## Design options (B, C, D, E)

Letters from the design discussion. **Near-term lock is B + C + E. D is rejected.**

| | What | Decision |
|---|------|----------|
| **B** | Unified Esplora finality reconciler | **Do** |
| **C** | Host-tx observation registry | **Do** |
| **D** | Always-on 6-conf poll actor | **Don't** |
| **E** | Complete without an in-progress membership test | **Do** |

**B — Unified Esplora finality reconciler.** One WASM pass: any `tree` / `ark` virtual tx that hosts VTXOs and has ≥6 Esplora confirmations stamps `is_unrolled` on every vout of that txid (terminal leaves included; `commitment` / `checkpoint` skipped). Same constant as today (`UNILATERAL_EXIT_LEAF_CONFIRMATIONS`). Runs on Arkade load (including autonomous), operator sync, proceed, progress, list-in-progress, and complete — not only while a frontend job is polling. Job proceed/progress may still call it for snappy in-job UI.

**C — Host-tx observation registry.** Persist per virtual `txid`: `registered_at`, `relayed`, `confirmations`, `never_seen_probes`, `last_probed_at`. Register **immediately before** broadcast of that step so a false broadcast error cannot skip the row. Hot Esplora set is this table (plus a materials heal for tagged VTXOs if a write was missed). `never_seen` after a probe budget cools the **tx** row; it does not untag VTXOs.

**D — Always-on 6-conf poll actor.** A dedicated unlocked-session ticker (XState `after` or rail poller) that sleeps until 6 confirmations even when the user is idle on the dashboard. Rejected: load/sync/proceed/progress/list/complete already cover “closed the tab for an hour”; a background 6-conf waiter is extra machinery for this purpose.

**E — Complete without an in-progress membership test.** `complete_unilateral_exit` must not require the outpoint to be in `unilateral_exit_in_progress_outpoints()` (`VtxoNotInUnilateralExit`). The gate is snapshot readiness (`is_unrolled && !is_spent`, later `complete_ready`) plus Esplora claimable. Aborted or failed jobs may still leave VTXOs that should be claimed.

---

## Why this refactor

Abort and failure stop the **frontend job**. They do not un-broadcast anything (`ARK-EXIT-23`). Completing those coins still requires local `is_unrolled`, and that stamp currently runs only while the job is polling Esplora (`proceed` / `get_unilateral_exit_progress` for leaves; operator sync for intermediate hosts).

If a host tx is broadcast, then the job dies **before 6 confirmations**:

- Complete fails (`is_unrolled` never flips).
- Start-unroll hides the same outpoints (pending deductions still mark them in-progress).
- Hydrate will not rebuild a job from leftover WASM in-progress rows.
- Autonomous mode also skips operator sync, so even the intermediate-host Esplora pass never runs.

Complete also still requires membership in `unilateral_exit_in_progress_outpoints()`. Aborted-but-unrolled VTXOs must remain claimable without that job.

**Near-term lock:** B + C + E. **Not D.** See [Design options](#design-options-b-c-d-e).

The long-term fix is not another flag. It is a **VTXO exit lifecycle** plus a **host-tx observation** table. The job becomes the broadcaster; the VTXO record owns the coin until it is exited or funding is lost.

---

## Target model

### Two records

Unroll is per **virtual tx**. Claim, spend-lock, and theft are per **VTXO outpoint**. Persist both in the WASM envelope (`sdkPersistenceJson`).

| Record | Key | Answers |
|--------|-----|---------|
| **VTXO exit** | `(txid, vout)` | Is this coin in the pipeline? May it be spent off-chain? Can we complete? Was funding stolen? |
| **Host-tx observation** (C) | virtual `txid` | Did we attempt broadcast? Relayed? Confirmations? Still in the Esplora hot set? |

Many VTXOs share one host tx (sibling vouts, en-passant hosts). One observation row drives all of them.

WASM is **durable source of truth**. Frontend XState hydrates from it and orchestrates user actions. Esplora reconcile in WASM may advance phases while no tab, job, or actor is running.

### VTXO phases

```text
idle
  → tagged
      → host_broadcast_attempted
          → host_relayed
              → host_confirmed          // ≥1 confirmation (reorg-sensitive)
                  → unrolled            // ≥6 confirmations
                      → complete_ready  // timelock + claimable UTXO
                          → exited
      ↘ funding_lost                    // from tagged onward
```

**Abort is not a VTXO phase.** It only stops the job broadcaster. Records stay, except the one safe revert below.

| Phase | Meaning |
|-------|---------|
| `idle` | Not in the pipeline. Eligible for a new job / collab / send (subject to usual buckets). |
| `tagged` | On a started job’s branch (selected leaf **or** en-passant host). **Spend-lock starts here.** Host tx not submitted. **Only phase abort may revert to `idle`.** |
| `host_broadcast_attempted` | About to publish **this** VTXO’s host tx (txid known). Written **immediately before** `submitpackage`. |
| `host_relayed` | Esplora `/raw` (or the existing step-wait fallback) saw the tx. Sticky until reorg handling says otherwise. |
| `host_confirmed` | ≥1 confirmation (`UNILATERAL_EXIT_STEP_CONFIRMATIONS`). Same meaning as today’s step cursor. Reorg under 1 conf rewinds here, not to `tagged`. |
| `unrolled` | ≥6 confirmations (`UNILATERAL_EXIT_LEAF_CONFIRMATIONS`). Stamp **every vout** on that txid; register watches. Timelock may still be running. |
| `complete_ready` | Unrolled **and** owner can claim (`can_be_claimed_unilaterally_by_owner`). Complete uses this gate, not in-progress membership. |
| `exited` | Our completion spend is visible on Esplora. Terminal. |
| `funding_lost` | Terminal. Foreign spend of an exit-relevant outpoint, or checkpoint replacing the branch. **Per VTXO** — one leaf can be lost while a sibling stays `complete_ready`. |

Tag at **job start** for every exit-relevant outpoint on the plan (the set `exit_relevant_vtxo_outpoints_for_plan` already uses for viability). Register the **host tx** later, on the proceed step that publishes it.

### Parallel clocks (do not merge)

| Clock | What it is | Who advances it |
|-------|------------|-----------------|
| Job DAG cursor | Next unpublished step in `ordered_step_txids` | Job XState + proceed |
| Host-tx confirmations | 0 / relayed / 1-conf / 6-conf | WASM Esplora reconciler (B) + observation row (C) |
| Protocol timelock | Unilateral-exit delay after unroll confirms | Esplora UTXO / `can_be_claimed_unilaterally_by_owner` |

An en-passant VTXO can be `unrolled` / `complete_ready` while the job is still broadcasting descendants.

UI copy must distinguish “waiting for confirmations” from “waiting for timelock.”

### Host-tx observation (C)

Shape (Stage 1 can be this boring):

```text
txid, registered_at, relayed, confirmations, never_seen_probes, last_probed_at
```

**Register** immediately before broadcast of that step, after the parent is built and the txid is known, **before** `broadcast_unilateral_exit_step_at_fee_rate`. Today proceed writes `unilateral_exit_step_wait` only after success; a false error after a real relay is the hole.

Do **not** register the whole remaining DAG at job start (Esplora-spam + timeout-on-never-broadcast).

**Hot probe set:** rows that are not `never_seen` and still have `confirmations < 6`, plus (after 6 conf) VTXOs in `unrolled` / `complete_ready` that need output-status / timelock probes.

**`never_seen` budget** (evaluated on B entry points, not a sleep loop): first probe after ~10 minutes from `registered_at`, then up to four more at ~1 minute spacing. If still absent:

- Cool **this observation row** (stop hot-probing that txid).
- Move VTXOs **back to `tagged`**, not `idle`.
- User may proceed again (deterministic txid → re-register, reset probe window).

Never drop a VTXO tag because Esplora was slow or the tab was closed.

| Observation | Action |
|-------------|--------|
| ≥6 confs, all vouts stamped | Cool mempool probes. Keep as evidence until VTXOs are `exited` / `funding_lost`. |
| Never seen after budget | Delete or archive the observation. VTXOs stay `tagged`. |
| All VTXOs on that host are `exited` or `funding_lost` | Delete. |
| Reorg under 1 conf | Do **not** delete. Rewind VTXOs to `host_relayed` / `host_broadcast_attempted`. |

**B is the safety net:** on load/sync, also probe host txs of tagged VTXOs in materials even if C missed a write. C is the cheap hot set; B is “if it is 6-conf on chain, stamp it.”

**B entry points (no dedicated poll actor):** Arkade load (including autonomous), operator sync, proceed, progress, `list_unilateral_exits_in_progress`, complete. Same 6-conf constant as today. Skip `commitment` / `checkpoint`. Include terminal leaves (today’s intermediate-only reconciler is the wrong split).

### Abort, spend-lock, complete

| Situation | VTXO | Spend-lock |
|-----------|------|------------|
| Job started, nothing broadcast | `tagged` → abort → **`idle`** | Unlock |
| Host tx registered / relayed / any confs | Abort does **not** change phase | Stay locked |
| Intermediate host already 6-conf, leaves not published | Intermediates keep walking to `complete_ready`; leaves stay `tagged` (branch at risk) | Both stay locked |
| `funding_lost` | Terminal | Not completable |

Leaves whose host was never observed: if an **ancestor** was published, keep them `tagged` (collab spend would race the ASP). Surface “resume unroll or complete what is already unrolled.”

**Spend-lock from `tagged` is a balance-model change.** Today, during unroll those VTXOs stay in gross spendable; pending deductions are informational until 6 confs. Target: `unilateral_exit_in_progress` includes `tagged` onward, and those sats are not collaboratively spendable. Recoverable / renew / send must refuse them. Stage 2 owns this; Stage 1 must not silently change dashboard math.

**Complete gate:** snapshot `complete_ready` (unrolled + unspent + timelock/claimable). Remove `VtxoNotInUnilateralExit` / in-progress membership (E).

---

## XState

Use XState for the VTXO exit lifecycle on the **frontend**. There is no better tool already in this stack for making illegal transitions unrepresentable, spawning per-outpoint actors, and keeping UI/hooks from re-deriving phase.

XState is **not** the durability layer and **not** the Esplora watcher.

| Layer | Owns | Does not own |
|-------|------|----------------|
| **WASM** | Persisted VTXO phase, host-tx observation, 6-conf stamp, watches, spend-heal | UI, `after` delays, job fee/automation policy |
| **Job machine** (existing) | Broadcast the next unpublished host tx, 1-conf wait, bumper/fees, abort orchestration | Per-coin claim readiness, 6-conf stamp |
| **VTXO machines** (new) | Hydrated view of one outpoint’s phase; user events (`COMPLETE`, resume); selectors for copy (“confirmations” vs “timelock”) | Submitting unroll packages; sleeping until 6 confs |

### Topology

Keep one module-scope job actor (today’s `unilateral-exit.machine.ts`). **Spawn one child actor per tagged VTXO**, keyed by `(txid, vout)`.

```text
unilateralExit (job)          — broadcaster; abort/terminate/automation
  └─ vtxoExit:{txid}:{vout}   — one spawned machine per tagged outpoint
```

- Parent `START_*` / `HYDRATE_OR_START` tags outpoints in WASM, then spawns missing children from the persisted record list (not only from job bookmark).
- Parent abort: job → `aborted` → `idle`; children with phase ≥ `host_broadcast_attempted` **keep their actors** (or respawn on next load from WASM). Children still in `tagged` with no ancestor published may be stopped after WASM reverts them to `idle`.
- `WALLET_RESET` / lock: stop all actors. Next unlock hydrates children from WASM records. Crash recovery is records, not “leftover in-progress DTO.”
- Selectors read child snapshots; they must not re-run completion guards from raw progress DTOs (same rule as the job machine).

### What must not go in XState `after`

A per-VTXO `after` delay until 6 confirmations is option **D**, which this refactor rejects. Confirmation depth advances in WASM on B’s entry points. Children **rehydrate** when those RPCs return (load, sync, proceed, progress, list, complete). The job machine’s `waitingConfirm` / `pollDelay` stays for **1-conf step advance while broadcasting**, not for leaf finality.

### Split of events (draft for Stage 0 spec)

Job machine keeps: `START_*`, `PROCEED_*`, `ABORT_ORCHESTRATION`, automation, viability terminate.

VTXO machine (draft; names freeze in Stage 0 YAML):

| Event | Typical source |
|-------|----------------|
| `HYDRATE` | WASM record on load / after B reconcile |
| `HOST_REGISTERED` | Proceed is about to broadcast this host |
| `HOST_RELAYED` / `HOST_CONFIRMED` / `UNROLLED` | WASM observation |
| `COMPLETE_READY` | WASM claimable check |
| `COMPLETE` | User (Complete dialog) |
| `EXITED` / `FUNDING_LOST` | WASM spend-heal / viability |
| `UNTAG` | Abort while still `tagged` and safe |

WASM may jump several phases in one reconcile (e.g. load after an hour: `host_broadcast_attempted` → `unrolled`). Hydrate must **set state from the record**, not replay every intermediate event.

### When to introduce the machines

| Stage | XState work |
|-------|-------------|
| 0 | Spec job vs VTXO machines, events, spawn/stop rules. No new machine file required. |
| 1 | No new VTXO machine. Job machine unchanged except it must not be the only 6-conf stamper. |
| 2 | Optional: spawn children as a **read-only view** of WASM records (selectors). Do not move spend-lock into ad hoc React state. |
| 3 | Children consume `funding_lost` / exited from WASM; job `terminated` means “no remaining broadcastable tagged VTXOs.” |
| 4 | VTXO machines are the UI source of phase. Control page / Complete dialog subscribe to children. Job machine is only the broadcaster. Update `.cursor/rules/unilateral-exit-xstate.mdc` for the two-machine family. |

Do not put a Rust port of XState in `bitboard-ark`. Persist a phase enum (or equivalent) and let the frontend machine mirror it.

---

## Mapping from current persistence

End state: VTXO exit table + host-tx observation table are authoritative. Until then, new records are the write path; old fields are derived — do not debug three truths.

| Today | Becomes |
|-------|---------|
| Frontend job `selected_leaf_outpoints` | Orchestration cursor: which tagged VTXOs is the user broadcasting? |
| `pending_exit_deductions` (unilateral) | `tagged` … `host_confirmed` (balance line) |
| `is_unrolled` + exiting bucket | `unrolled` / `complete_ready` |
| `unilateral_exit_watches` | Survival of `unrolled+` across snapshot replace (fold into records in Stage 3) |
| `unilateral_exit_step_wait` | Job cursor + host `relayed` fallback |
| `unilateral_exit_in_progress_outpoints` union | **Derived** from VTXO records |
| Complete `VtxoNotInUnilateralExit` | Deleted (E) |
| Job-only 6-conf stamp | B, driven by C’s hot set + materials heal |
| Job `terminated` | `funding_lost` on affected VTXOs; job stops broadcasting |

Materials (`unilateral_exit_materials_by_leaf_tx`) stay prefetch at operator sync. They are not the lifecycle.

---

## Stages

Each stage is a separate implementation plan. Exit criteria are what the next stage may assume.

### Stage 0 — Spec

Document intended behavior in `doc/features/` (new `ARK-EXIT-*` / extend existing) and this handbook. Freeze:

- VTXO phases and transitions
- Host-tx observation fields and probe budget
- B entry points; no D
- Abort rules and spend-lock from `tagged` (as **target**; implementation in Stage 2)
- Complete = `complete_ready` (E)
- Job vs VTXO XState split

**Out of scope:** code, envelope version bump.

**Exit:** YAML + this doc agreed; no product ambiguity on abort / en-passant / complete-after-abort.

### Stage 1 — Close the safety hole (B + C + E)

The original bug. Ship this even if later stages slip.

- Host-tx observation table; register **before** broadcast.
- Persist `relayed` + `confirmations` (not “we waited 10 minutes”).
- Unified 6-conf reconciler for all `tree` / `ark` host txs (terminals included).
- Stamp all vouts + register watches.
- Run B on load (including autonomous), operator sync, proceed, progress, list-in-progress, complete.
- `never_seen` probe budget; do not untag VTXOs (Stage 1 analogue: leave pending deductions in place).
- Complete without in-progress membership; keep `validate_snapshot_completion_ready` (`is_unrolled && !is_spent`) plus claimable check.

**Keep** pending deductions, watches, `is_unrolled`, job machine as they are. C + B **feed** `is_unrolled` so aborted unrolls become completable.

**Out of scope:** spend-lock from job start, VTXO phase enum in UI, balance-table change, XState children, folding watches.

**Exit:** After abort (or killed job) a host tx that later reaches 6 confs is stamped on next B entry; Complete can claim it without a frontend job. Autonomous load stamps without operator sync. No new always-on poller.

### Stage 2 — VTXO records as source of truth

- Persist VTXO exit records; tag at job start for all plan-relevant outpoints.
- Derive candidates, in-progress, complete-ready, recoverable exclusion from records.
- Pending deductions become derived or are written from tags.
- **Spend-lock from `tagged`.** Update [arkade-bitboard-wallet-model.md](arkade-bitboard-wallet-model.md): tagged sats are in the exit line and not collab-spendable.
- Optional read-only XState children for selectors.

**Out of scope:** deleting watches; per-VTXO `funding_lost` replacing job terminate.

**Exit:** Starting a job immediately locks those VTXOs against send / collab / recover / renew. Complete and in-progress lists are record-derived. Abort before any broadcast unlocks; abort after host register does not.

### Stage 3 — Absorb watches and viability

- Fold `unilateral_exit_watches` into records that must survive snapshot replace (`ARK-EXIT-12` / `ARK-SYNC-03` truth table).
- `funding_lost` is per-VTXO; job `terminated` is “no remaining broadcastable tagged VTXOs” plus banners.
- Abort never clears records past `host_broadcast_attempted`.
- Viability checks run against records, not only the active job leaf set (so aborted branches still detect ASP sweep / foreign spend).

**Out of scope:** full control-page rewrite.

**Exit:** Snapshot replace cannot drop an unrolled VTXO. Mixed outcomes in one former job (one leaf swept, one complete_ready) are representable.

### Stage 4 — UI / XState family

- Spawn/stop VTXO child actors from WASM records on hydrate.
- Control page and Complete dialog subscribe to child snapshots for phase copy.
- Job machine is only the broadcaster for tagged VTXOs whose host is not yet `host_confirmed`.
- Hydrate-from-job-bookmark can remain; recovery is records + Complete, not inventing a job from leftover WASM flags.
- Update `.cursor/rules/unilateral-exit-xstate.mdc` for the two-machine family.

**Exit:** UI never infers “can complete” from job state alone. Aborted unrolls show as waiting-for-confirmations / waiting-for-timelock / ready without restarting a job.

---

## What not to do

- Rely on ASP `is_unrolled` as the recovery path (sticky merge only preserves a **local** true).
- Keep two stampers (leaf vs intermediate) with different callers after Stage 1.
- Poll 6-conf only while the job is in `waitingConfirm`.
- Add a dedicated unlocked-session 6-conf poller (D).
- Make complete work off pending deductions without `is_unrolled` / `unrolled` (0-conf / reorgable).
- Untag VTXOs because a broadcast error or `never_seen` budget fired.
- Stamp `commitment` or `checkpoint` as unrolled.
- Let React or hooks own VTXO phase outside XState after Stage 4.
- Implement Stages 1–3 in one envelope migration / one PR.

---

## Implementation-plan checklist (per stage)

When writing a stage plan, include:

1. Spec IDs (`ARK-EXIT-*`) touched or added
2. Persistence / envelope version if the WASM blob shape changes
3. WASM vs frontend vs XState files
4. Tests per [testing-strategy](../.cursor/rules/testing-strategy.mdc): Rust unit for stamp/reconcile; Rust error-path invariants; Vitest for UX; E2E only for the happy path that cannot be proved cheaper
5. Explicit “does not change” list (especially dashboard balance in Stage 1)
6. WASM rebuild (`build:wasm`) before browser verification
