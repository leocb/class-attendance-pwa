import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Optional public hostname for a Cloudflare tunnel (e.g. alunos-dev.leobottaro.com).
// Set via `npm run dev:tunnel`; keeps plain localhost dev unaffected.
const devTunnelHost = process.env.DEV_TUNNEL_HOST?.trim();

export default defineConfig({
  server: {
    allowedHosts: devTunnelHost ? [devTunnelHost] : undefined,
    hmr: devTunnelHost
      ? { host: devTunnelHost, protocol: 'wss', clientPort: 443 }
      : undefined,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'zxing_reader.wasm'],
      manifest: {
        name: 'Class Attendance',
        short_name: 'Class Attendance',
        description: 'Offline-first classroom attendance with rotating signed QR codes and passkey teacher authentication.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/time$/],
        runtimeCaching: [
          {
            urlPattern: /\/zxing_reader\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
          exceljs: ['exceljs'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
