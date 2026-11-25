# ClassAttend — Offline-First Classroom Attendance PWA

Production-ready, offline-first Progressive Web App for classroom attendance using rotating cryptographically signed student QR codes and passkey-only teacher authentication.

## Architecture Overview

- **Frontend (`src/`)**: React 19 + TypeScript + Vite + `vite-plugin-pwa` (Workbox precaching for app shell, Firebase SDK, `exceljs`, and `/zxing_reader.wasm`).
- **Cryptography (`src/lib/crypto`)**: Non-extractable **ECDSA P-256** student keys stored directly as `CryptoKey` objects in IndexedDB (`idb`). QR codes rotate every 30s and carry an ECDSA signature over `v1|sid|n|ts|nce|fp|sha256Hex(img)`.
- **Time Synchronization (`src/lib/time`, `getServerTime`)**: Estimates server time offset via `GET /time` so device clock drift does not break the 180-second freshness window.
- **Auth**:
  - **Teachers**: WebAuthn passkeys only (`@simplewebauthn/browser` + `@simplewebauthn/server` in `passkeyAuth` Cloud Function) minting Firebase custom tokens with `{ teacher: true }`. No email, password, or recovery.
  - **Students**: Anonymous Firebase Auth (`signInAnonymously`) at registration only; identified by school ID in signed QR.
- **Backend (`functions/`)**: Firebase Cloud Functions v2 (`registerFirstScan`, `approveRotation`, `getServerTime`, `passkeyAuth`) and strict Firestore Security Rules (`firestore.rules`) that forbid client writes to `students`/`classes` and forbid `list` on `students`.
- **Offline Excel Export (`src/lib/excel`)**: In-browser XLSX generation via `exceljs` from IndexedDB caches (`✓`, `A`, `—`, `Presence %`, optional `Summary` sheet).

## Local Development & Testing

```bash
# Install dependencies
npm install
npm --prefix functions install

# Copy env template and fill Firebase project values
cp .env.example .env

# Run unit tests (client + Cloud Functions)
npm test
npm --prefix functions test

# Typecheck & build PWA (generates dist/sw.js + precache)
npm run build
npm --prefix functions run build
```

## Firebase Setup & Deployment

1. Create a Firebase project with **Firestore (Native mode)** and **Authentication** (enable **Anonymous** sign-in provider, and add `alunos.leobottaro.com` under **Authentication → Settings → Authorized domains**).
2. Configure Cloud Functions WebAuthn env vars (`functions/.env` from `functions/.env.example`):
   ```env
   WEBAUTHN_RP_ID=alunos.leobottaro.com
   WEBAUTHN_ORIGIN=https://alunos.leobottaro.com
   ```
3. Deploy Firestore rules & indexes and Cloud Functions:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

## Hosting on Cloudflare (`alunos.leobottaro.com`)

The frontend PWA + same-origin API proxy is configured for **Cloudflare Workers with Static Assets** via [wrangler.jsonc](file:///Users/leocb/Code/Class%20Attendance/wrangler.jsonc) and [worker/index.ts](file:///Users/leocb/Code/Class%20Attendance/worker/index.ts):

- Custom domain route: `alunos.leobottaro.com` (`custom_domain: true`, automatically provisions SSL and DNS when the `leobottaro.com` zone is on Cloudflare).
- Same-origin proxies `/time`, `/api/time`, and `/api/passkey/*` to your Firebase Cloud Functions while preserving `Origin: https://alunos.leobottaro.com` for WebAuthn passkeys.
- Sets `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js` and `Content-Type: application/wasm` on `/zxing_reader.wasm`.

Deploy to Cloudflare:

1. Set your deployed Firebase Functions URL in `wrangler.jsonc` (`FIREBASE_FUNCTIONS_BASE_URL`, or `GET_SERVER_TIME_URL` + `PASSKEY_AUTH_URL` for Gen 2 `a.run.app` URLs).
2. Authenticate Wrangler and deploy:
   ```bash
   npx wrangler login
   npm run deploy:cf
   ```

> **HTTPS Requirement**: WebAuthn passkeys, `getUserMedia` camera access, and WebCrypto require HTTPS (automatically provided by Cloudflare for `alunos.leobottaro.com`; `localhost` also works for local development).
