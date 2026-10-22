import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    cssCodeSplit: false,
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
  },
});
