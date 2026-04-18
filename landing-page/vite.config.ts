import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteImprintDefine } from '../load-imprint-env.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** PWA wallet version from `frontend/package.json` (same artifact users run at app.bitboard-wallet.com). */
function readWalletAppVersion(): string {
  try {
    const pkgPath = path.resolve(projectRoot, '../frontend/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const walletAppVersion = readWalletAppVersion();

export default defineConfig({
  define: {
    ...viteImprintDefine(),
    'import.meta.env.VITE_WALLET_APP_VERSION': JSON.stringify(walletAppVersion),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, '.'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(projectRoot, 'index.html'),
        install: path.resolve(projectRoot, 'install.html'),
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
