# Bitboard Wallet Frontend

React + TypeScript frontend for the Bitboard Wallet application.

## Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Material-UI (MUI) v6** - Component library
- **React Router** - Client-side routing
- **TanStack Query** - Server state management
- **Playwright** - E2E testing
- **Swagger UI React** - API documentation

## Development

### Prerequisites

- Node.js 24+ and npm

### Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run E2E tests with Playwright
- `npm run test:ui` - Run E2E tests with Playwright UI

## Features

## E2E Testing

### Running E2E Tests

```bash
# Run all tests
npx playwright test

# Run in headed mode
npx playwright test --headed

# Run specific test file
npx playwright test tests/e2e/lab.spec.ts

# Run with UI mode
npx playwright test --ui

# View test report
npx playwright show-report
```

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

## Vite Configuration

### Environment Variables

Create a `.env` file for local configuration:

```env
VITE_API_URL=http://localhost:8000
```

## LaTeX (KaTeX) in TSX

Library articles (and any other TSX that renders KaTeX) must import **`InlineMath`** and **`BlockMath`** from `@/lib/library/math`, not from `react-katex`, so `katex/dist/katex.min.css` is bundled consistently.

### Macros and backslashes (`InlineMath.tex` / `BlockMath.tex`)

Whenever the formula contains LaTeX macros (`\frac`, `\cdot`, `\mathbb`, …), pass the source through the tagged template on the **same** component:

```tsx
import { BlockMath, InlineMath } from '@/lib/library/math'

<InlineMath math={InlineMath.tex`\lambda = \frac{y_2 - y_1}{x_2 - x_1}`} />
<BlockMath math={BlockMath.tex`a^{p-1} \equiv 1 \pmod{p}`} />
```

`InlineMath.tex` and `BlockMath.tex` are **`String.raw`**: backslashes are preserved exactly for KaTeX.

**Why not plain `math="\frac{…}{…}"`?**

1. Values that are genuinely **JavaScript string literals** interpret escapes such as `\f`, `\n`, and `\t`, which silently corrupts many macro names (`\frac`, `\cdot`, `\text`, …).

2. **JSX / toolchain differences** between `vite dev` and production builds (and across compiler upgrades) are not something we want to rely on for correctness. Using `.tex` keeps one stable rule: macros always come from a tagged template.

Plain strings remain fine for tiny fragments with **no** macro backslashes (for example `math="G"`). Prefer `.tex` whenever the snippet includes `\`.

## Project Structure

```
frontend/
├── src/
│   ├── api/           # API client functions
│   ├── components/    # Reusable components
│   ├── contexts/      # React contexts (theme, etc.)
│   ├── pages/         # Page components
│   ├── utils/         # Utility functions
│   ├── App.tsx        # Main app component with routing
│   └── main.tsx       # Entry point
├── tests/
│   ├── e2e/           # E2E test files
│   ├── fixtures.ts    # Playwright fixtures
│   ├── helpers.ts     # Test helper functions
│   └── init.ts        # Test initialization
├── playwright.config.ts
└── vite.config.ts
```

## Building for Production

```bash
# Build the frontend
npm run build

# The output will be in the dist/ folder
# Serve it with any static file server
npm run preview
```

The production build is optimized and ready to deploy to any static hosting service (Netlify, Vercel, GitHub Pages, etc.). For **Vercel**, use the canonical **GitHub Actions → prebuilt deploy** flow described in [`../docs/deploy-vercel.md`](../docs/deploy-vercel.md).

## Dark Mode

The app includes a built-in dark mode toggle available in the top-right corner of the navigation bar. The theme preference is persisted in localStorage.