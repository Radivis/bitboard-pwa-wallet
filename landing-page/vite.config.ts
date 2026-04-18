import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteImprintDefine } from '../load-imprint-env.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    ...viteImprintDefine(),
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
