# Bitboard network types

Planning note. Nothing here is implemented.

Related:

- App enum that already names Mutinynet: `BitcoinNetwork` in `crypto/src/types.rs`
- Frontend mode map: `NETWORK_MODE_TO_BITCOIN` in `frontend/src/lib/wallet/bitcoin-utils.ts`
- Arkade mode map: `NetworkMode` in `bitboard-arkade/src/network.rs`
- Bumper rewrite of testnet3 to testnet4: `bumper_bdk_network` in `third_party/ark-bdk-wallet/src/lib.rs`
- Signet vs Mutinynet chain check, which stays outside `bitcoin::Network`: `crypto/src/esplora_network_identity.rs`
- Rejected shortcut: [PR #78](https://github.com/Radivis/bitboard-pwa-wallet/pull/78), which taught the Arkade operator-info cache to accept the string `mutinynet`. Live `getInfo` already maps that string to `bitcoin::Network::Signet` in ark-core. The cache parser was not the worker crash.

---

## Problem

Bitboard has to name chains that its Bitcoin dependencies do not name.

rust-bitcoin 0.32 and BDK 2.4 persist `bitcoin::Network`: `bitcoin`, `testnet` (testnet3), `testnet4`, `signet`, `regtest`. BDK compares that enum on load. It has no Mutinynet variant and no Testnet5 variant. Public Signet and Mutinynet share the signet genesis and the `tb` address HRP, so neither `check_network` nor `check_genesis_hash` can tell them apart. Testnet3, testnet4, signet, and Mutinynet also share BIP32 testnet version bytes.

ark-core does parse the operator string `mutinynet`, then converts it to `bitcoin::Network::Signet` before any wallet code sees it.

The app already papers over this in several places, and the maps disagree:

- `BitcoinNetwork` has Mutinynet, and `From<BitcoinNetwork> for Network` collapses it to Signet.
- `From<Network> for BitcoinNetwork` sends `Testnet4` and any future variant to Signet through a wildcard.
- The frontend keeps Mutinynet as its own mode, then calls that value a `BitcoinNetwork`.
- The Arkade bumper stores BDK's `testnet4` for the product's testnet.
- Operator-info and operator-identity each have their own `network_label` match.

A new string arm on one of those matches does not define the chain. It only adds another spelling.

---

## Invariant

Bitboard has one internal network type. Every dependency label is converted at the boundary of that type, in one module, in both directions. Call sites do not match on `bitcoin::Network` or on operator JSON strings.

The internal type names the chains the product actually runs: mainnet, testnet4, public signet, Mutinynet, and regtest. Testnet3 is not a product network. Testnet5 is added only when rust-bitcoin has a variant for it, as an explicit arm, not a wildcard.

Two conversions are allowed to lose information, and they must say so:

- Into `bitcoin::Network` / BDK: Mutinynet becomes `Signet`. Testnet4 stays `Testnet4`. There is no round trip from `Network::Signet` back to Mutinynet.
- Into ark-core's server network: same collapse. The operator string `mutinynet` is accepted only at this boundary and stored, if at all, as the internal Mutinynet value.

Signet and Mutinynet stay distinct inside Bitboard. Which one a BDK changeset or an Esplora tip belongs to is decided from chain data (block hashes after the shared genesis, and the height check that exists today), then stored as the internal type. It is not decoded from `ChangeSet.network`, which can only say `signet`.

---

## Out of scope until that module exists

Do not add `mutinynet`, `testnet4`, or `testnet5` aliases to individual parsers (`parse_bitcoin_network`, the duplicate `network_label` functions, ad hoc frontend strings). Those parsers go away when the boundary module is the only translator.
