import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as { version: string };

let gitCommit = '';
try {
  gitCommit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // Building outside a git checkout is fine; the footer just shows the version.
}

/**
 * Local-dev only: brokers a Firebase custom token for a fixed test teacher by
 * calling the secret-guarded `passkeyAuth` dev endpoint. The secret stays on the
 * Vite server (never in the client bundle) and the endpoint is inert in
 * production unless DEV_LOGIN_SECRET is set on the function.
 */
const DEV_LOGIN_PATH = '/__dev/login';
const DEV_LOGIN_UPSTREAM =
  'https://southamerica-east1-classroom-attendance-a03af.cloudfunctions.net/passkeyAuth/api/passkey/dev/login';

function devTestLoginPlugin(secret: string | undefined): Plugin {
  return {
    name: 'dev-test-login',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(DEV_LOGIN_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        if (!secret) {
          res.statusCode = 503;
          res.end(
            JSON.stringify({
              error: 'DEV_LOGIN_SECRET is missing from .env.local',
            })
          );
          return;
        }
        try {
          const upstream = await fetch(DEV_LOGIN_UPSTREAM, {
            method: 'POST',
            headers: { 'x-dev-login-secret': secret },
          });
          res.statusCode = upstream.status;
          res.end(await upstream.text());
        } catch (err) {
          console.warn('[dev-login] upstream failed', err);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'Dev login upstream unavailable' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify(gitCommit),
    },
    plugins: [
      devTestLoginPlugin(env.DEV_LOGIN_SECRET),
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
  };
});
