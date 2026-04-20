import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { readBitboardWalletVersion } from '../frontend/common/bitboard-wallet-version';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const walletAppVersion = readBitboardWalletVersion();

/** React packages from this app only — shared TSX under ../frontend/ must not resolve react from there. */
const reactRoot = path.resolve(projectRoot, 'node_modules/react')
const reactDomRoot = path.resolve(projectRoot, 'node_modules/react-dom')

export default defineConfig({
  define: {
    'import.meta.env.VITE_WALLET_APP_VERSION': JSON.stringify(walletAppVersion),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(projectRoot, '.'),
      '@common': path.resolve(projectRoot, '../frontend/common'),
      '@legal-locale': path.resolve(projectRoot, '../frontend/src/lib/legal-locale.ts'),
      '@legal-entity-fields': path.resolve(
        projectRoot,
        '../frontend/src/components/LegalEntityFields.tsx',
      ),
      '@legal-entity': path.resolve(
        projectRoot,
        '../frontend/src/legal-entity/legal-entity.ts',
      ),
      react: reactRoot,
      'react-dom': reactDomRoot,
      'react/jsx-runtime': path.join(reactRoot, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(reactRoot, 'jsx-dev-runtime.js'),
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
