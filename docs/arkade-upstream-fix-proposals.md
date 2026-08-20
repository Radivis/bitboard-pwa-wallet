# Arkade upstream fix proposals

Issues that belong in [arkade-os/arkd](https://github.com/arkade-os/arkd) or [arkade-os/rust-sdk](https://github.com/arkade-os/rust-sdk), not as Bitboard-only workarounds.

Local vendor patches (things we already forked) live in the `third_party/ark-*/README.md` tables. This list is for **operator/protocol** bugs we cannot fully fix in the client.

| ID | Repo | Summary | Status |
|----|------|---------|--------|
| ARK-UP-01 | arkd | `deleteIntent` / proof match ignores boarding inputs | Open (not filed) |
| ARK-UP-02 | arkd | Cooperative boarding window uses CSV seconds as wall-clock | Open (not filed) |
| ARK-UP-03 | arkd | Short `sessionDuration` + confirm stage poisons boarding retries | Open (not filed) |

---

## ARK-UP-01 — `deleteIntent` does not match boarding-only intents

**Target:** [arkade-os/arkd](https://github.com/arkade-os/arkd) `internal/core/application/service.go`

**Symptom:** A valid BIP-322 delete proof for a boarding UTXO returns:

```text
INVALID_INTENT_PROOF (23): no matching intents found for intent proof
```

Proof verification succeeds. The match step then finds zero cached intents.

**Cause:** `RegisterIntent` stores boarding UTXOs on `TimedIntent.BoardingInputs` and VTXOs on `TimedIntent.Inputs`. `verifyIntentProofAndFindMatches` (used by `DeleteIntentsByProof` and `GetIntentByProofs`) only compares proof outpoints against `ti.Inputs`. A boarding-only registration therefore never matches.

The public API says the client should prove ownership of **any input** of the registered intent. Boarding UTXOs are inputs of that intent.

**Proposed fix:** In the match loop, also compare proof outpoints to `ti.BoardingInputs` (same txid/vout equality as VTXO `Inputs`). Empty match list should stay `INVALID_INTENT_PROOF` only when neither set overlaps.

**Bitboard today:** Ownership-only delete proofs work for VTXO intents. Boarding-only Cancel does not call `deleteIntent` (explicit error). Boarding-only Retry re-joins without deleting first **only when the boarding UTXO is still unspent** (ARK-BATCH-07 spent-check first). Spent or cooperative-window-expired boarding intents are finalized locally and are not re-settled. See `bitboard-ark/src/session/pending_batch.rs` (`pending_intent_retry_decision`). Until arkd ships the match, a leftover still-pending boarding registration can still block Retry with `duplicated input` until the register intent expires (~2 minutes).

**Contract:** `ARK-BATCH-06` / `ARK-BATCH-07` in `doc/features/arkade.yaml`.

---

## ARK-UP-02 — Boarding cooperative window is wall-clock, not blocks

**Target:** arkd `validateBoardingInput` (boarding exit delay)

**Symptom:** Even when `ARKD_BOARDING_EXIT_DELAY` is block-denominated (e.g. 30 blocks), arkd applies a **~30 second** cooperative settle window because it uses `exitDelay.Seconds()` as elapsed wall-clock seconds.

**Bitboard today:** `is_past_arkd_cooperative_boarding_window` in vendored `ark-client`; E2E funds and settles within ~25s. Documented in [arkade-regtest fixture README](../frontend/tests/e2e/fixtures/arkade-regtest/README.md).

**Proposed fix:** Interpret the delay according to the configured locktime type (blocks vs seconds), or document that boarding cooperative expiry is always seconds regardless of CSV denomination.

---

## ARK-UP-03 — Confirmation failures from abandoned / duplicate boarding intents

**Target:** arkd round confirmation stage (`not enough intent confirmations received`)

**Observed on Mutinynet** (`sessionDuration: 60`, no `scheduledSession`):

1. Client `RegisterIntent` succeeds (`intentId` returned).
2. Client opens `/v1/batch/events` (topics = boarding outpoint + ephemeral cosigner).
3. Within seconds: `batchFailed` with `INTERNAL_ERROR (0): not enough intent confirmations received`.
4. Often **no usable `batchStarted` match** for the *current* `intentId` (hash mismatch or client already left the SSE).

**Mechanism:**

- After `BatchStarted`, arkd waits `confirmationDuration()` (~half of remaining session time) for `ConfirmRegistration` / ack keyed by `sha256(intentId)`.
- If the wallet drops the SSE (timeout) or retries with a **new** registration while the previous intent was already `Pop`'d into the live round, the outpoint is free to register again, but `BatchStarted.intentIdHashes` still list the **old** id.
- Nobody acks the selected hashes → round fails → intents may be re-pushed → the next attempt repeats.

`deleteIntent` cannot clear boarding-only registrations today (ARK-UP-01), so Mutinynet boarding is especially prone to this loop.

**Proposed operator improvements (any of):**

- Reject `RegisterIntent` when the same boarding outpoint is already selected in the current confirmation session (not only when still in the intent queue).
- Include boarding outpoints / intent ids in a way clients can detect “your previous intent is in confirmation; do not re-register.”
- Longer default `sessionDuration` on public test ASPs, or publish `scheduledSession` so wallets can stay subscribed.

**Bitboard today:** Longer post-register SSE wait; boarding Retry refuses to re-register while a fresh `intent_id` is still within the register `expire_at` window (~2 minutes); ignore `BatchFailed` until we have matched a `BatchStarted` for our intent (`batch_failure_matches_our_round` requires `batch_id`).
