# Taproot + Base58 Error Investigation

## Summary

When building a transaction with a **Taproot** (BIP86) descriptor wallet on regtest, `build_transaction` fails with:

```
Transaction error: base58 error
```

**Workaround:** Switching to **SegWit** (BIP84) descriptor wallet works. The same flow (fund → sync → build tx → send) succeeds with SegWit.

## Environment

- **bdk_wallet:** 2.3
- **bitcoin:** 0.32
- **Network:** Regtest (bcrt1 addresses)
- **Descriptor format:** `tr(xpriv/86'/1'/0'/0/*)` (external), `tr(xpriv/86'/1'/0'/1/*)` (internal)

## Possible Sources of the Error

The bitcoin crate's `Address::from_str` uses this order:

1. Try `bech32::segwit::decode(s)` (handles both bech32 and bech32m)
2. If that fails → try `base58::decode_check(s)` (legacy addresses)

A "base58 error" means the **bech32/bech32m decode failed first**, so the parser fell back to base58, which then failed. That implies either:

### A. Recipient address parsing (`Address::from_str`)

- A valid `bcrt1p` (Taproot) address should parse via bech32m
- If the recipient string is malformed, has wrong checksum, or triggers a bech32m bug, it would fall through to base58 and fail
- **Mitigation applied:** We trim and strip `bitcoin:` prefix from the recipient; SegWit addresses work

### B. Change output derivation (inside `tx_builder.finish()`)

- BDK derives the change address from the internal descriptor
- Taproot descriptors use `tr(xpriv/...)` with extended keys (base58check)
- If BDK or miniscript parses/encodes the internal key or descriptor in a path that expects base58 and gets something else (or vice versa), it could produce this error
- **Reference:** [bdk_wallet #54](https://github.com/bitcoindevkit/bdk_wallet/issues/54) – descriptor validation issues; [rust-miniscript #554](https://github.com/rust-bitcoin/rust-miniscript/issues/554) – descriptor string/checksum panics

### C. PSBT / key origin handling

- Taproot uses x-only pubkeys; key origins in PSBTs may involve base58 (xpub) encoding
- A bug in Taproot-specific PSBT or key-origin handling could surface as a base58 error

## Relevant Issues

| Repo | Issue | Relevance |
|------|-------|-----------|
| [bdk_wallet #54](https://github.com/bitcoindevkit/bdk_wallet/issues/54) | Descriptor validation; crash on descriptors without address form | Descriptor handling |
| [rust-miniscript #554](https://github.com/rust-bitcoin/rust-miniscript/issues/554) | String descriptors panic on `to_string` with invalid chars | Descriptor checksum/encoding |

## Suggested GitHub Issue (bdk_wallet)

Below is a draft you can adapt and open at https://github.com/bitcoindevkit/bdk_wallet/issues/new:

---

**Title:** Taproot descriptor wallet: "base58 error" when building transaction on regtest

**Description:**

When building a transaction with a Taproot (BIP86) descriptor wallet on regtest, `TxBuilder::finish()` fails with:

```
Transaction error: base58 error
```

**Setup:**
- bdk_wallet 2.3, bitcoin 0.32
- Descriptors: `tr(xpriv/86'/1'/0'/0/*)` (external), `tr(xpriv/86'/1'/0'/1/*)` (internal)
- Network: regtest
- Recipient: valid `bcrt1q` (SegWit) or `bcrt1p` (Taproot) address

**Observed:**
- SegWit (`wpkh`) descriptor wallet: transaction builds successfully
- Taproot (`tr`) descriptor wallet: fails with "base58 error"

**Hypothesis:** The error may originate from:
1. Recipient address parsing (though `bcrt1p` should parse via bech32m)
2. Change output derivation from the internal Taproot descriptor
3. PSBT/key-origin handling for Taproot

**Workaround:** Use SegWit descriptors instead of Taproot for regtest.

---
