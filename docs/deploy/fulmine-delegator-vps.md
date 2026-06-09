# Fulmine delegator VPS (Hetzner)

Bitboard runs **three Fulmine instances** on one VPS—one per live network—so the PWA can use network-scoped `RestDelegatorProvider` URLs without background renewal in the browser.

## Topology

| Network (app `NetworkMode`) | Fulmine service | Suggested hostname | `FULMINE_ARK_SERVER` (confirm at deploy) | `FULMINE_ESPLORA_URL` |
|-----------------------------|-----------------|--------------------|------------------------------------------|------------------------|
| `mainnet` | `fulmine-mainnet` | `delegator-mainnet.bitboard-wallet.com` | Production Arkade operator | `https://mempool.space/api` |
| `testnet` | `fulmine-testnet4` | `delegator-testnet4.bitboard-wallet.com` | Testnet4 operator | `https://mempool.space/testnet4/api` |
| `signet` (Mutinynet) | `fulmine-mutinynet` | `delegator-mutinynet.bitboard-wallet.com` | Mutinynet Arkade operator | `https://mutinynet.com/api` |

Each instance needs an isolated `FULMINE_DATADIR` and `FULMINE_HTTP_PORT` (e.g. 7001, 7002, 7003). Expose HTTPS via Caddy or Traefik on the hostnames above.

## Delegate API (Fulmine-compatible)

The app expects (see `@arkade-os/sdk` `RestDelegatorProvider`):

- `GET /api/v1/delegator/info` — delegator pubkey, fee, address
- `POST /api/v1/delegate` — signed intent + forfeit PSBTs

Pin Fulmine and `@arkade-os/sdk` versions together ([ts-sdk PR #262](https://github.com/arkade-os/ts-sdk/pull/262)).

## App configuration

Set Vite env vars (see `frontend/.env.example`) so builds point at your hostnames:

- `VITE_ARKADE_DELEGATOR_MAINNET`
- `VITE_ARKADE_DELEGATOR_TESTNET`
- `VITE_ARKADE_DELEGATOR_SIGNET`
- `VITE_ARKADE_OPERATOR_MAINNET`
- `VITE_ARKADE_OPERATOR_TESTNET`
- `VITE_ARKADE_OPERATOR_SIGNET`

Defaults in code fall back to Arkade public operators when env vars are unset (development only).

## Operations

- Health-check `GET …/delegator/info` per instance from monitoring.
- Log failed delegations; alert if renewals stall near VTXO expiry.
- Document delegator fee in product copy (read from `/delegator/info` in the app).

## Regtest (later)

Reserve a fourth Fulmine instance and `VITE_ARKADE_DELEGATOR_REGTEST` when regtest Arkade is enabled in the app.

Reference: [Fulmine](https://github.com/ArkLabsHQ/fulmine), [Arkade intent delegation](https://docs.arkadeos.com/arkd/components/intent-delegation.md).
