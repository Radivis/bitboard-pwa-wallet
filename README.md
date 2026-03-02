# Bitboard PWA Wallet

A non-custodial educational Bitcoin wallet based on the principles simplicity first, transparency, depth in detail, full control, and upgradeable security. The wallet is a Progressive Web App using Rust and React as core technologies.

## Development
### Requirements
- Rust
- Optional, but suggested: Go and lefthook for the Git hooks

### Initialization

#### Git hooks
For CD there is a lefthook.yml file. You need to run

`lefthook install`

for the Git hooks to actually work.
The same commands also updates the hooks, if you update the config file lefthook.yml.

If you don't have lefthook installed, you need to install it first.
I've tried Rust-based alternatives, but they are still a far cry from the simplicity of lefthook.

When you perform a commit, it is suggested to do so in a console in which you can see the output.

### Coding Guidelines
Both humans and agents should adhere to `.cursor/rules`. The file `.cursor/rules/coding-codex.mdc` is the canonical starting point.

### Testing
#### Backend
Testing works with the default

`cargo test`

but using nextest is preferred:

`cargo nextest run`

#### React

There is a convenient script that can run all e2e tests conveniently in the background and issues a notification (currently only tested on Linux) on test success / failure:
`./scripts/run-e2e-background.sh`

Otherwise change to frontend directory first:
`cd frontend`

Component tests:
`npm run test`

e2e tests:
`npm run test:e2e`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.