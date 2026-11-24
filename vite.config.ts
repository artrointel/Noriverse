import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'apps/web',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: ['index.html', 'startrail/index.html'].map(page => fileURLToPath(new URL(`./apps/web/${page}`, import.meta.url))),
    },
  },
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
});
