# Bark exit sync, stale success, and record durability

Planning note. Findings 3 and 4 are not implemented. Finding 5 is implemented.

These are findings 3, 4, and 5 from the Bark implementation review (`.cursor/pr-reviews/pr-70-bark-implementation.md`). Finding 2 is already resolved. Delegated refresh is a separate change and does not cover these.

Related:

- Sync: `bark_sync` in `bitboard-bark/src/session.rs`
- Claim broadcast: `barkEmergencyExitClaimDeps` in `frontend/src/lib/bark/bark-emergency-exit-live-deps.ts`
- Claim PSBT: `bark_drain_emergency_exits` in `bitboard-bark/src/emergency_exit.rs`
- Flush boundary: `mutateBark` in `frontend/src/workers/bark.worker.ts`
- Persistence: `docs/persistence/bark.md`

---

## 3. Make a claim visible to Bark's exit manager

`Exit::drain_exits` only builds a signed PSBT. It does not mark the exit spent. Bark marks the claim when its own chain source sees the transaction, which requires `Exit::sync` / `Wallet::sync_exits`.

`bark_sync` never calls `sync_exits`. After claim, the app broadcasts through the on-chain Esplora (`mempool.space` for signet and mainnet) and then runs `bark_sync`. Bark watches a different Esplora (`esplora.signet.2nd.dev` / `mempool.second.tech`). The exit stays claimable, so a second claim spends the same outputs.

Same gap, earlier in the exit:

- `start_exit_for_entire_wallet` returns success when every VTXO is non-standard. The UI treats that empty start as done.
- Progress is a manual button. It is not part of periodic sync.
- Starting an exit does not broadcast the tree. Coins stay sweepable at expiry until the user presses Progress and the CPFP children are broadcast.

Fix:

- After a claim broadcast, call `sync_exits` against Bark's chain source before treating the claim as finished. Do not treat the on-chain Esplora broadcast alone as proof Bark has seen it.
- A claim that Bark has not observed stays claim-in-progress. It must not be offered again as a fresh drain of the same outputs.
- An exit start that marks nothing reports that, instead of a silent success.
- Progress of exits that are already started belongs on the same sync that resumes boards and rounds, so a started exit is broadcast without a second manual step.

## 4. Do not stamp a sync that missed the mailbox

`Wallet::sync` returns `()` and only logs failures of mailbox sync, pending Arkoor, pending rounds, and the force-exit scan. `bark_sync` treats `refresh_server` plus `sync_pending_boards` as proof the session is synced, then opens the balance gate.

Incoming Arkoor payments arrive through the mailbox. A live server and a failed mailbox sync still stamp `lastSuccessfulSyncAt` and keep the old spendable balance. `Wallet::sync` already calls `sync_pending_boards` and swallows that error. The extra `sync_pending_boards` after it is the only board error that fails the sync.

Fix:

- A mailbox, pending-Arkoor, or pending-round failure fails `bark_sync`. It does not mark the session synced and does not refresh the shown spendable amount.
- The balance gate stays closed until those steps have succeeded in this attempt.
- Board errors keep failing the sync once. The inner `Wallet::sync` log line is not a second, weaker signal.

## 5. Flush Bark checkpoints before the WASM call returns

Implemented. A wallet-action checkpoint, exit row, or exit child is encrypted into the open network's dump before that write returns. `mutateBark` still flushes when the call returns. A tab killed after that flush reloads the checkpoint, and the next sync resumes a stored board or offboard. Exit rows reload on the next session open. See [Bark persistence](../persistence/bark.md).
