# Bitboard PWA Wallet

A non-custodial educational Bitcoin wallet based on the principles simplicity first, transparency, depth in detail, full control, and upgradeable security. The wallet is a Progressive Web App using Rust and React as core technologies.

## Warning

⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨

₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙

```
This wallet is still in its initial development phase.

Do not assume that it is secure!

Do not store more than you can afford to lose on it!
```


₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙₿🪙

🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨

⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

## Security

To report a security vulnerability, use **GitHub private vulnerability reporting** as described in [SECURITY.md](SECURITY.md). Technical threat model and implementation details are documented in [doc/SECURITY.md](doc/SECURITY.md).

## Principles

**Please note that the features mentioned in this section are planned, but not fully implemented yet. They are mentioned to communicate the spirit and direction of this app.**

### Simplicity First
Start with the absolute basics and unlock additional features deliberately, as you understand the technology better.

### Transparency
No hidden magic. You can inspect what is going on - if you want to.

### Depth in Detail
Learn about the intricacies of Bitcoin and Lightning as you go. Use advanced features like multiple accounts per wallet, coin control, and UTXO labeling.

### Full Control
You decide how this wallet works. Don't like the default behavior? Then change the settings accordingly.

### Upgradeable Security
A hot wallet is faced with certain risks inherently. Use a hardware wallet for better security and manage your funds with Bitboard. Or couple Bitboard with an external always-on Lightning wallet to never miss a payment.

## Technology
Bitboard is a PWA using React for the frontend. All crypto operations are performed in a separate web worker using WASM. The WASM code is generated using Rust as the source language. A second web worker deals with persisting the data in an in-browser SQLite database using the OPFS storage. Keys and other sensitive data are encrypted by the crypto web worker using AES-256-GCM and Argon2id before they are stored.

This approach enables adequate performance and security for a web / PWA wallet. For even better security, please choose one of the supported upgrade paths when available.

For the full tech stack, see the [architecture documentation](doc/ARCHITECTURE.md)

**Please note that native mobile versions of Bitboard are planned for the future!**

## Development
### Requirements
- Node.js (>=24.0.0)
- npm
- Rust
- Optional, but suggested: Go and lefthook for the Git hooks

### Build and Run

The project consists of a Rust crypto library compiled to WASM and a React frontend. The WASM build must complete before the frontend can run.

#### 1. Install Rust and the WASM target

```bash
rustup target add wasm32-unknown-unknown
```

#### 2. Install wasm-pack

The crypto crate is built to WASM using [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/):

```bash
cargo install wasm-pack
```

#### 3. Build the WASM modules

From the project root:

```bash
cd crypto && wasm-pack build --target bundler --out-dir ../frontend/src/wasm-pkg
cd bitboard-encryption && wasm-pack build --target bundler --out-dir ../frontend/src/wasm-pkg/bitboard_encryption
```

Or from the frontend directory (builds both crates):

```bash
cd frontend && npm run build:wasm
```

The output goes to `frontend/src/wasm-pkg/` (crypto) and `frontend/src/wasm-pkg/bitboard_encryption/` (encryption; gitignored with the parent). You need to run this at least once before starting the dev server, and again whenever you change the Rust code in `crypto/` or `bitboard-encryption/`.

#### 4. Install frontend dependencies and run

```bash
cd frontend
npm install
npm run dev
```

The dev server will be available at the URL shown (typically `http://localhost:5173`).

#### Full production build

From the project root:

```bash
cd frontend && npm run build
```

This runs the WASM build, TypeScript compilation, and Vite build in sequence.

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