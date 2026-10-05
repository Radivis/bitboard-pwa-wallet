# Bark regtest

Local captaind on the existing arkade-regtest chain. Arkade-only start does not boot this container.

| | |
|---|---|
| Image | `docker.io/secondark/captaind:0.7.1` |
| Public RPC | `http://localhost:3535` |
| Esplora | `http://localhost:7030/api` |
| Container | `bitboard-regtest-captaind` |
| Config | `docker/captaind/captaind.toml` |

Expiry knobs in that config (phase 1 keeps the 0.7.1 defaults):

- `vtxo_lifetime` = 4320
- `vtxo_exit_delta` = 144
- `required_board_confirmations` = 3
- `min_board_amount` = 20000 sat

From `frontend/`:

```bash
npm run test:e2e:bark-regtest
```

That clean-starts the bark profile, then runs the `@bark-regtest` Playwright tag. The one implemented journey is E2E-BARK-REG-02. It writes `frontend/test-results/bark-boarded-fixture.json`.

The Rust invariant, from `bitboard-bark/` against a stack that is already up:

```bash
BARK_REGTEST_RUN=1 cargo test --features regtest-support --test sync_while_server_stopped_regtest -- --ignored --test-threads=1
```
