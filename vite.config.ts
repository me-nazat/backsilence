import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    // Three is intentionally a single raw 523 KB vendor chunk; the gzip audit
    // remains the release gate and is far below the 450 KB total budget.
    chunkSizeWarningLimit: 550,
    modulePreload: { polyfill: true },
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
