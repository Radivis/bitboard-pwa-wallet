import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

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
    'import.meta.env.VITE_WALLET_APP_VERSION': JSON.stringify(walletAppVersion),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, '.'),
      '@common': path.resolve(projectRoot, '../frontend/common'),
      '@legal-locale': path.resolve(projectRoot, '../frontend/src/lib/legal-locale.ts'),
      '@legal-notice-display': path.resolve(
        projectRoot,
        '../frontend/src/lib/legal-notice-display.ts',
      ),
      '@legal-entity-fields': path.resolve(
        projectRoot,
        '../frontend/src/components/LegalEntityFields.tsx',
      ),
      '@legal-entity': path.resolve(
        projectRoot,
        '../frontend/src/legal-entity/legal-entity.ts',
      ),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(projectRoot, 'index.html'),
        install: path.resolve(projectRoot, 'install.html'),
        privacy: path.resolve(projectRoot, 'privacy.html'),
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
