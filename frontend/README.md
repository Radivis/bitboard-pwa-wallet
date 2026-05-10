# Bitboard Wallet Frontend

React + TypeScript frontend for the Bitboard Wallet application.

For how this fits with Rust/WASM workers, OPFS SQLite, and deployment, see the [repository root README](../README.md) and [architecture overview](../doc/ARCHITECTURE.md).

## Tech Stack

- **React 19** — UI
- **TypeScript** — Types
- **Vite** — Dev server and production build
- **TanStack Router** — File-based client routing (`@tanstack/react-router`, `@tanstack/router-plugin`)
- **TanStack Query** — Async / server-adjacent state
- **Tailwind CSS v4** — Styling (`@tailwindcss/vite`)
- **Radix UI** — Primitives; component patterns follow **shadcn**-style conventions ([`components.json`](components.json))
- **Zustand** — Client state (with persistence where needed)
- **Kysely + SQLite (WASM)** — In-browser persistence via workers and OPFS
- **Rust → WebAssembly** — Crypto, encryption, and Lightning logic (`npm run build:wasm` / `wasm-pack`); loaded with `vite-plugin-wasm`
- **vite-plugin-pwa** — Progressive Web App / service worker
- **Vitest** + **Testing Library** — Unit and component tests (`jsdom`)
- **Playwright** — End-to-end tests

## Features

- Installable **PWA** with offline-oriented caching for static assets (see `vite.config.ts`).
- **Wallet** flows: on-chain and Lightning (including NWC-related paths); **Lab** for local chain exploration; **Library** for in-app articles with math.
- Esplora-backed chain data in dev/production is proxied safely (Vite dev proxies and the [`api/`](api/) Vercel handlers).

## Development

### Prerequisites

- **Node.js** 24+ and **npm** (`package.json` `engines`)
- For **`npm run build`** (production bundle): **Rust** toolchain, **`wasm-pack`**, and the sibling crates under `../crypto`, `../bitboard-encryption`, and `../bitboard-lightning` (the `build` script runs `build:wasm` before `tsc` and `vite build`)

### Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app is served at `http://localhost:3000` (see `vite.config.ts`).

### Available Scripts

- `npm run dev` — Vite dev server
- `npm run build` — `build:wasm` → `tsc` → production Vite build (`dist/`)
- `npm run build:wasm` — Rebuild all frontend WASM packages via `wasm-pack` (requires Rust + `wasm-pack`)
- `npm run preview` — Preview the production build locally
- `npm run lint` — ESLint
- `npm test` — Vitest
- `npm run test:ui` — Vitest with UI
- `npm run test:coverage` — Vitest with coverage
- `npm run test:e2e` — Playwright E2E suite
- `npm run test:e2e:ui` — Playwright with UI mode
- `npm run test:e2e:headed` — Playwright headed
- `npm run test:e2e:sequential` — Playwright with `E2E_SEQUENTIAL=true`
- `npm run test:e2e:debug` — Playwright debug mode
- `npm run test:e2e:nwc` — Grep NWC-tagged tests with in-memory NWC mock
- `npm run test:e2e:lab` — Lab-tagged E2E subset
- `npm run test:e2e:regtest` — Starts regtest docker helper then regtest-tagged tests
- `npm run test:regtest:start` / `npm run test:regtest:stop` — Regtest environment helpers
- `npm run sync-version` / `npm run verify-version` — Version sync with repo root (see `../scripts`)

## E2E Testing

### Running E2E Tests

From `frontend/`, prefer npm scripts so the same config as CI is used:

```bash
npm run test:e2e

npm run test:e2e:headed

npm run test:e2e -- tests/e2e/lab.spec.ts

npm run test:e2e:ui

npx playwright show-report
```

Equivalent `npx playwright test` invocations work as well (`playwright.config.ts` lives in this directory).

### Optional: funded Testnet wallet (live Esplora)

This repo includes an **optional** Playwright flow that hits public Testnet Esplora (not run in CI). Use a **dedicated** testnet-only wallet with a non-zero balance.

1. Create `.env.testnet` in `frontend/` **or** at the **repo root** (both gitignored) with:

   - `E2E_TESTNET_SEED` — space-separated 12-word mnemonic
   - `E2E_TESTNET_APP_PASSWORD` — Bitboard app password for first-run setup

2. Fund that wallet on testnet.
3. Run from `frontend/`:

```bash
npm run test:e2e:testnet-live
```

Never commit `.env.testnet` or reuse a mainnet seed.

## Environment variables

Vite exposes `import.meta.env.*`. Commonly useful **optional** vars (see [`src/vite-env.d.ts`](src/vite-env.d.ts) for the full typed list):

| Variable | Purpose |
| --- | --- |
| `VITE_E2E_NWC_MOCK` | When `true`, dev server + NWC-focused E2E use the in-memory Lightning mock (`npm run test:e2e:nwc`). |
| `VITE_HIDE_ROUTER_DEVTOOLS` | `1` or `true` hides TanStack Router devtools in development. |
| `VITE_ARGON2_CI` | `1` uses faster Argon2 parameters in **non-production** builds only; forbidden in production bundles (enforced in `vite.config.ts`). |

Use a `.env`, `.env.local`, or other [Vite env files](https://vite.dev/guide/env-and-mode.html) as needed. The app talks to Esplora via same-origin proxies (dev: `vite.config.ts`; production: `api/esplora/[...path].ts`)—not via a single “backend base URL” env in current code. For data flow details, see [`../doc/ARCHITECTURE.md`](../doc/ARCHITECTURE.md).

## LaTeX (KaTeX) in TSX

Library articles (and any other TSX that renders KaTeX) must import **`InlineMath`** and **`BlockMath`** from `@/lib/library/math`, not from `react-katex`, so `katex/dist/katex.min.css` is bundled consistently.

### Macros and backslashes (`InlineMath.tex` / `BlockMath.tex`)

Whenever the formula contains LaTeX macros (`\frac`, `\cdot`, `\mathbb`, …), pass the source through the tagged template on the **same** component:

```tsx
import { BlockMath, InlineMath } from '@/lib/library/math'

<InlineMath math={InlineMath.tex`\lambda = \frac{y_2 - y_1}{x_2 - x_1}`} />
<BlockMath math={BlockMath.tex`a^{p-1} \equiv 1 \pmod{p}`} />
```

`InlineMath.tex` and `BlockMath.tex` read **`TemplateStringsArray.raw` only** (same idea as `String.raw`): backslashes reach KaTeX exactly as written. They **reject `${…}`** inside the template — interpolations are merged using JavaScript “cooked” segments, where `\n` inside `\not`, `\neq`, etc. can become a real newline and corrupt the formula.

**Why not plain `math="\frac{…}{…}"`?**

1. Values that are genuinely **JavaScript string literals** interpret escapes such as `\f`, `\n`, `\t`, and `\b`, which silently corrupts many macro names (`\frac`, `\cdot`, `\binom`, `\text`, …).

2. **JSX / toolchain differences** between `vite dev` and production builds (and across compiler upgrades) are not something we want to rely on for correctness. Using `.tex` keeps one stable rule: macros always come from a tagged template.

Plain strings remain fine for tiny fragments with **no** macro backslashes (for example `math="G"`). Prefer `.tex` whenever the snippet includes `\`.

### KaTeX in production (alias `katex` to its ESM entry)

KaTeX ships two builds: `katex/dist/katex.mjs` (ESM) and `katex/dist/katex.js` (CJS UMD — a single webpack closure). `react-katex` 3.1 is itself a CJS UMD bundle that does `require("katex")`, so by default Node's conditional-exports resolution picks the **CJS** variant. Rolldown's CJS-to-CJS interop hoists that webpack UMD closure incorrectly: the ~343 top-level `defineMacro(...)` calls register macros in one scope while the parser ends up reading a different macros table at render time — the same class of bug as [vitejs/vite#22176](https://github.com/vitejs/vite/issues/22176). The visible symptom is that production renders **macros** like `\frac`, `\in`, `\mod`, `\equiv`, `\pmod` as red `\f`/`\i`/`\m`/`\e`/`\p` "undefined control sequence" fragments — while **symbols** like `\cdot` (registered via the always-exported `defineSymbol(...)` table) still work fine.

The fix in `vite.config.ts` is a single `resolve.alias` entry that routes the bare `katex` specifier to the ESM file:

```ts
resolve: {
  alias: [
    { find: /^katex$/, replacement: '…/node_modules/katex/dist/katex.mjs' },
    // …
  ],
}
```

The regex anchor (`/^katex$/`) keeps `katex/dist/katex.min.css` and other sub-paths unchanged. Rolldown bundles the ESM cleanly, all top-level side effects execute, and `react-katex`'s `_interopRequireDefault(_katex)` adapts the ESM module to its CJS expectations.

The neighbouring `build.rolldownOptions.output.strictExecutionOrder: true` is unrelated to this specific bug but defends against the rolldown/rolldown#8812 (TinyMCE) / #9225 (@noble/curves+@noble/hashes) class of chunk-execution-order issue and is cheap insurance.

If you bump KaTeX, `react-katex`, Vite, or Rolldown, smoke-test the production bundle by running `npm run build && npm run preview` and either visiting a math-heavy library article (ECDSA, Schnorr) by hand or running `npm run probe:katex` (expects `PROBE_URL`, default `http://localhost:4173`). For Vercel Preview Protection, pass `VERCEL_BYPASS_TOKEN` or `VERCEL_BYPASS_TOKEN_FILE`. Set `DEBUG_PROBE=1` for extra logging. The probe treats red KaTeX fragments as failures — `redElementCount: 0` means macros rendered correctly.

## Project Structure

```
frontend/
├── api/                 # Vercel serverless handlers (e.g. Esplora proxy)
├── common/              # Shared code (legal copies, privacy helpers, …)
├── public/              # Static assets
├── src/
│   ├── components/      # Reusable UI
│   ├── db/              # SQLite / Kysely, migrations, wallet persistence
│   ├── hooks/
│   ├── lib/             # Domain helpers, Esplora whitelist, library math, …
│   ├── routes/          # TanStack Router routes and pages
│   ├── stores/          # Zustand stores
│   ├── test-utils/      # Vitest setup and providers
│   ├── workers/         # Web workers (crypto, lab, encryption, …)
│   ├── wasm-pkg/        # Generated WASM packages (via `npm run build:wasm`)
│   ├── main.tsx         # SPA entry
│   └── routeTree.gen.ts # Generated route tree (TanStack Router plugin)
├── tests/
│   ├── e2e/             # Playwright specs
│   └── e2e/helpers/     # E2E helpers
├── playwright.config.ts
├── vite.config.ts
└── index.html
```

## Building for Production

```bash
# Full production build (WASM + TypeScript check + Vite)
npm run build

# Output in dist/
npm run preview
```

The production build is optimized for static hosting. On **Vercel**, follow the canonical **GitHub Actions → prebuilt deploy** flow in [`../docs/deploy-vercel.md`](../docs/deploy-vercel.md).

## Dark Mode

The header includes a **theme** control (**light** / **dark** / **system**) next to Infomode. The choice is persisted locally (Zustand `persist`).
