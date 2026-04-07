# Lightning and Bitboard wallets

This document records how Bitboard scopes Lightning (NWC today, in-app node in the future) relative to **Bitboard wallets** (`wallet_id`). It exists so implementation choices stay consistent when new features raise “should we share this across wallets?” questions.

**NWC balance and payment-history snapshots** are stored **inside the encrypted `wallet_secrets` payload** (with NWC connection strings), not in cleartext SQLite.

## One Bitboard wallet, one Lightning context

- **NWC connections** are stored and presented in the context of a **single** Bitboard wallet. They are not global app resources shared across unrelated seeds.
- When an **in-app Lightning node** exists, the intended model is **one node per Bitboard wallet**: keys and channel state derive from that wallet’s identity, analogous to products such as Mutiny (one wallet ↔ one embedded node).

## No cross-wallet sharing of sensitive or wallet-specific state

- **Do not** share or merge Lightning snapshot data (cached NWC balances, payment lists, or future node state) across different Bitboard `wallet_id`s.
- The same user may paste the **same** NWC URI into two Bitboard wallets; that may **duplicate** stored data. That is acceptable. **Deduplicating** by NWC URI across wallets is **out of scope** unless the product explicitly moves to first-class “Lightning wallet” entities.

## Rationale (short)

- **Private channel data** and **delegated NWC access** are tied to a single economic/UX context; mixing them across unrelated on-chain wallets is hard to reason about for security and privacy.
- Keeping snapshots scoped by `connection_id` and `wallet_id` preserves a clear trust boundary: “this is what we last saw for **this** Bitcoin wallet’s Lightning setup.”
