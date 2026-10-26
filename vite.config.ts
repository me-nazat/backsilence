import { defineConfig } from 'vite';

interface MinimalResponse {
  writeHead?(statusCode: number, headers: Record<string, string>): void;
  end?(body: string): void;
  headersSent?: boolean;
}

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
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            const serverRes = res as MinimalResponse;
            if (serverRes.writeHead && serverRes.end && !serverRes.headersSent) {
              serverRes.writeHead(200, { 'Content-Type': 'application/json' });
              serverRes.end(JSON.stringify({ offline: true, rows: [] }));
            }
          });
        },
      },
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            const serverRes = res as MinimalResponse;
            if (serverRes.writeHead && serverRes.end && !serverRes.headersSent) {
              serverRes.writeHead(200, { 'Content-Type': 'application/json' });
              serverRes.end(JSON.stringify({ offline: true, rows: [] }));
            }
          });
        },
      },
    },
  },
});
