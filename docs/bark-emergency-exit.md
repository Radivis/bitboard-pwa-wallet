# Bark emergency exit

Developer handbook for how Bitboard runs a Bark emergency exit. Bark's exit manager owns the state machine. This wallet signs Pay-to-Anchor children from the on-chain wallet, broadcasts the claim, and records sweeps and seizures.

Arkade unilateral exit is a Bitboard state machine: [unilateral-exit.md](unilateral-exit.md). Bark emergency exit is Bark's `ExitState`, advanced by `progress_exits`.

Related:

- Test contracts `BARK-EMG-*`: [doc/features/bark.yaml](../doc/features/bark.yaml)
- Persistence (record envelope, pending claim): [persistence/bark.md](persistence/bark.md)
- Exit manager wrapper: [`bitboard-bark/src/emergency_exit.rs`](../bitboard-bark/src/emergency_exit.rs)
- Progress, children, and claim: [`frontend/src/lib/bark/perform-bark-emergency-exit.ts`](../frontend/src/lib/bark/perform-bark-emergency-exit.ts)
- Tip loop: [`frontend/src/lib/bark/bark-emergency-exit-automation.ts`](../frontend/src/lib/bark/bark-emergency-exit-automation.ts)

---

## Who does what

The Bark session opens with `onchain: None`. Bark's own on-chain wallet is not attached, and its eviction of a replaced child does not run. The bumper is the app's BDK wallet in the crypto worker.

| Concern | Owner |
|---------|--------|
| Exit states, broadcast of an exit package, confirmation, timelock, claimable detection | Bark `Exit::progress_exits` |
| Signing the first Pay-to-Anchor child, from confirmed on-chain coins | `sign_p2a_cpfp_child` |
| Remembering that child so its fee inputs look spent | `apply_unconfirmed_funding_transaction` |
| Polling the chain tip and progressing when it changes | `watchBarkEmergencyExitTips` |
| Syncing the on-chain wallet up to the tip before that progress | `catchUpOnchainWalletToChainTip` |
| Broadcasting the claim and remembering it until Bark has seen it | `claimBarkEmergencyExits` |
| A confirmed foreign spend of an anchor or an earlier exit output | `record_exit_chain_notices` |

One progress queue is shared by the tip loop, a manual Progress press, and the progress that follows a successful Bark sync. Two of those cannot sign children at the same time.

A child Bark has already broadcast is left alone. `cpfp_requests_needing_first_child` drops any request that carries an `rbf_requirement`. Fee bumping a package that is already in the mempool is not implemented. That is the fee work still ahead of any reorg rescue below.

---

## Chain reorganizations

Bark re-reads the chain on each progress. A same-height reorg changes the tip hash, and the tip loop treats that as a new tip, so progress runs.

While an exit transaction is still being published, Bark can move it back from confirmed to unconfirmed. `AwaitingDelta` returns to processing when the exit transaction itself is no longer confirmed. `ClaimInProgress` returns to claimable when the claim transaction is gone from mempool and chain. A shallow reorg that puts our own package back in the mempool is handled there.

Three edge cases stay as they are. Rescuing them is a poor trade next to replace-by-fee for Pay-to-Anchor packages.

### A foreign spend that was confirmed

A sweep or seizure is recorded at one confirmation and then kept. The VTXOs are marked spent, the notice is merged into the account and an empty later scan does not remove it, and the VTXO card prefers that notice over a live exit. While the exit is still in `Processing`, the next progress sees the spent mark and stops in `VtxoAlreadySpent`, which does not move again.

A reorg of that confirming block puts the foreign spend back in the mempool. Nodes re-add transactions from the orphaned block. They do not resurrect our exit transaction, which was dropped because it conflicted with that block. The sweep is in the lead again. Replacing it would be a new race against a transaction that already made it into a block, after the exit was already too late. The other outcome, syncing the losing tip and later finding our own exit on the winning chain, requires a full Bark sync during a stale tip that usually dies in seconds. The seizure scan runs on that sync, not on the tip poll. One confirmation of a foreign spend is treated as final.

### A Pay-to-Anchor child gone from the mempool

A shallow reorg does not drop the child. The parent and the child return to the mempool together, and the copy in the on-chain wallet is still the spend those fee coins are waiting on.

The child is actually gone only when it conflicts with the winning chain, when another transaction replaces it on the same anchor, or when it expires after 14 days in the mempool. A conflict on the exit output means that hop is already lost. A conflict on the fee coin is visible to the on-chain sync that runs before the next child is signed, and that sync frees the coin. On expiry, Bark rebroadcasts the stored package, which is the same child. A new child is requested only when that rebroadcast fails because an input is now spent. None of these is what a one-block reorg of our own package does.

#### Aside: Another wallet confirms a shared exit transaction

Two emergency exits can share a prefix. Each exit transaction has one Pay-to-Anchor output, so one child confirms that hop for every wallet that still has to pass through it. Bark does not require the child to be ours. On each progress, `update_package_from_network` asks the chain which transaction spends that anchor. If that spender is someone else's child, Bark downloads it and stores it as the package child. Once it is confirmed, the exit transaction is `Confirmed`, and `exits_needing_cpfp` skips it. The next exit transaction that is still unpublished is the one that gets a new child request.

While their child is only in the mempool, Bark reports an `rbf_requirement`. This wallet drops those requests, so it does not compete with a child that is already broadcast. It waits. If their child confirms, the bumper coin was never needed for that hop.

If this wallet had already broadcast its own child and theirs is the one that confirms, Bark replaces the stored child with theirs. The attempt to evict the old child runs only on Bark's on-chain wallet, which this session does not attach. The app wallet still hears about it: the next on-chain sync, which runs before the following progress, lists every unconfirmed transaction that spends a wallet script and drops any txid Esplora no longer returns for that script. Their child spends the anchor and their coin, so our bumper output is unspent again and can pay the next child.

### A claim that was confirmed

`Claimed` stays `Claimed`. Bark does not rewind it. A reorg puts our claim back in the mempool, still paying the receive address, and that transaction is the one likely to be mined again. The funds are at risk only if a different spend of the same output wins the new chain, which is a one-confirmation double-spend of a transaction we had already mined. A claim that then sat unmined for the whole mempool expiry would not be rebroadcast, because the exit would still be `Claimed`. That needs the fee rate to stay short of the mempool minimum for two weeks, on a transaction that was already good enough to be mined.

There is no Bark emergency-exit regtest that orphans a block. The Arkade unilateral-exit reorg test exists because Bitboard owns that confirmation cursor. Here the cursor belongs to Bark, and the edges above are accepted.
