# Bark regtest

Local captaind on the existing arkade-regtest chain. Arkade-only start does not boot this container.

| | |
|---|---|
| Image | `docker.io/secondark/captaind:0.7.1` |
| Public RPC | `http://localhost:3535` |
| Esplora | `http://localhost:7030/api` |
| Container | `bitboard-regtest-captaind` |
| Default config | `docker/captaind/captaind.toml` |
| Exit config | `docker/captaind/captaind.exit.toml` (`vtxo_exit_delta = 6`) |
| Refresh config | `docker/captaind/captaind.refresh.toml` (`vtxo_lifetime = 20`) |

Default expiry knobs:

- `vtxo_lifetime` = 4320
- `vtxo_exit_delta` = 144
- `required_board_confirmations` = 3
- `min_board_amount` = 20000 sat

The regtest Bark client treats a VTXO as due for refresh when 12 or fewer blocks remain. Receive, board, and Arkoor stay on the default file. Exit and refresh each clean-start, because captaind keeps the lifetime it booted with. `BARK_CAPTAIND_TOML` selects the file.

From `frontend/`:

```bash
npm run test:e2e:bark-regtest
npm run test:e2e:bark-exit-regtest
npm run test:e2e:bark-refresh-regtest
```

`test:e2e:bark-regtest` writes `frontend/test-results/bark-boarded-fixture.json` after two spendable VTXOs. The offboard, spent-input, and claim Rust tests load that file. The rejected-board test does not.

From `bitboard-bark/`, against a default-config stack that is already up:

```bash
BARK_REGTEST_RUN=1 cargo test --features regtest-support --test sync_while_server_stopped_regtest -- --ignored --test-threads=1
BARK_REGTEST_RUN=1 cargo test --features regtest-support --test board_submission_rejected_regtest -- --ignored --test-threads=1
BARK_REGTEST_BOARDED_FIXTURE=frontend/test-results/bark-boarded-fixture.json BARK_REGTEST_RUN=1 cargo test --features regtest-support --test offboard_while_server_stopped_regtest -- --ignored --test-threads=1
BARK_REGTEST_BOARDED_FIXTURE=frontend/test-results/bark-boarded-fixture.json BARK_REGTEST_RUN=1 cargo test --features regtest-support --test exit_input_already_spent_regtest -- --ignored --test-threads=1
BARK_REGTEST_BOARDED_FIXTURE=frontend/test-results/bark-boarded-fixture.json BARK_REGTEST_RUN=1 cargo test --features regtest-support --test emergency_exit_claim_before_observation_regtest -- --ignored --test-threads=1
```
