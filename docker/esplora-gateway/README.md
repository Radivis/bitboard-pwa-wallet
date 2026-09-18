# Esplora gateway (arkade-regtest)

mempool/backend v3.3.1 in electrum mode serves `GET /api/tx/:txId/hex` but not `/raw`. The wallet uses Esplora `GET /api/tx/:txId/raw` (binary) for relay detection (`is_tx_relayed_on_network`).

This gateway:

- **`GET /api/tx/:txid/raw`** — bitcoind mempool or confirmed chain only (404 for wallet-only / virtual stubs)
- **`GET /api/tx/:txid/status`** — bitcoind status when the tx is **confirmed** (overrides stale electrum `confirmed: false`)
- **All other paths** — proxied to `mempool_web` unchanged (broadcast, package submit, JSON `/tx`, etc.)

Wired via [`../arkade-regtest.override.yml`](../arkade-regtest.override.yml); host port `MEMPOOL_WEB_PORT` (default 7030) binds here instead of `mempool_web`.

## Manual probes

```bash
# Confirmed or mempool tx (replace TXID)
curl -sf -o /dev/null -w "raw=%{http_code}\n" http://localhost:7030/api/tx/$TXID/raw
curl -sf -o /dev/null -w "hex=%{http_code}\n" http://localhost:7030/api/tx/$TXID/hex

# Unknown txid → 404
curl -sf -o /dev/null -w "%{http_code}\n" \
  http://localhost:7030/api/tx/0000000000000000000000000000000000000000000000000000000000000000/raw

# Tip height (proxied)
curl -sf http://localhost:7030/api/blocks/tip/height

# CORS on /raw (required for browser WASM from Vite dev server)
curl -sI -H "Origin: http://127.0.0.1:3100" "http://localhost:7030/api/tx/$TXID/raw" | grep -i access-control

# Confirmed status from bitcoind (after mine) even when mempool /status stays unconfirmed
curl -sf "http://localhost:7030/api/tx/$TXID/status" | jq .
```

## Rebuild after code changes

```bash
# From repo root, with regtest stack managed by start-arkade-regtest.sh
docker compose -f regtest/docker/compose.base.yml -f regtest/docker/compose.ark.yml \
  -f docker/arkade-regtest.override.yml build esplora_gateway
docker compose -f regtest/docker/compose.base.yml -f regtest/docker/compose.ark.yml \
  -f docker/arkade-regtest.override.yml up -d esplora_gateway
```
