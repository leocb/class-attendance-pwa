# Class Attendance — Offline-First Classroom Attendance PWA

Production-ready, offline-first Progressive Web App for classroom attendance using compact rotating ECDSA-signed student QR codes, Firebase Storage HD selfies, and passkey-only teacher authentication. Localized in **English (`en`)** and **Português (Brasil) (`pt-BR`)** with automatic browser detection and a navbar language selector.

- **Live Production URL**: `https://alunos.leobottaro.com` (Cloudflare Workers + Static Assets)
- **Firebase Project**: `classroom-attendance-a03af` (`southamerica-east1` — São Paulo)

## Architecture Overview

- **Frontend (`src/`)**: React 19 + TypeScript + Vite + `vite-plugin-pwa` (Workbox precaching for app shell, Firebase SDK, `exceljs`, and `/zxing_reader.wasm`).
- **Edge Hosting & Proxy (`worker/index.ts`, `wrangler.jsonc`)**: Cloudflare Worker serving static SPA assets and proxying `/time`, `/api/time`, and `/api/passkey/*` same-origin to Firebase Cloud Functions in `southamerica-east1`.
- **Cryptography (`src/lib/crypto`)**: Non-extractable **ECDSA P-256** student keys stored directly as `CryptoKey` objects in IndexedDB (`idb`). Compact QR codes rotate every 30s and carry an ECDSA signature over `v1|sid|n|ts|nce|fp|sh`.
- **Selfie Storage (`src/lib/image/selfie.ts`, `storage.rules`)**: Student selfies are center-cropped to **512×512 WebP** (≤ 1 MB) and uploaded to Firebase Storage (`selfies/{sid}/{fp}.webp`). Teacher devices download, SHA-256 verify, and cache them locally in IndexedDB (`cache:selfies`) on first scan or key rotation so all subsequent scans work offline.
- **Time Synchronization (`src/lib/time`, `getServerTime`)**: Estimates server time offset via `GET /time` so device clock drift does not break the 180-second freshness window.
- **Auth**:
  - **Teachers**: WebAuthn passkeys only (`@simplewebauthn/browser` + `@simplewebauthn/server` in `passkeyAuth` Cloud Function) minting Firebase custom tokens with `{ teacher: true }`. No email, password, or recovery.
  - **Students**: Anonymous Firebase Auth (`signInAnonymously`) at registration only; identified by school ID in signed QR.
- **Backend (`functions/`)**: Firebase Cloud Functions v2 (`registerFirstScan`, `getRotationSelfie`, `approveRotation`, `getServerTime`, `passkeyAuth`, `verifyTurnstile`) in `southamerica-east1`, plus strict Firestore & Storage security rules (`firestore.rules`, `storage.rules`) and Cloudflare Turnstile bot protection.
- **Offline Excel Export (`src/lib/excel`)**: In-browser XLSX generation via `exceljs` from IndexedDB caches (`✓`, `A`, `—`, `Presence %`, optional `Summary` sheet).

## Local Development & Testing

```bash
# Install dependencies
npm install
npm --prefix functions install

# Copy env templates (first-time setup)
cp .env.example .env
cp functions/.env.example functions/.env

# Run unit tests (client + Worker + Cloud Functions)
npm test
npm --prefix functions test

# Typecheck & build PWA + Cloud Functions
npm run build
npm --prefix functions run build
```

**Bot check on localhost:** the Turnstile gate is automatically disabled when the app runs on `localhost`/`127.0.0.1` (the production sitekey is not valid there), and `verifyTurnstileToken` skips verification when `FUNCTIONS_EMULATOR=true`. Deployed environments still verify every token.

## Initial Environment Setup (Reference)

1. **Firebase Console (`classroom-attendance-a03af`)**:
   - **Firestore Database** in Native mode (`(default)`).
   - **Firebase Storage** enabled (`classroom-attendance-a03af.firebasestorage.app`).
   - **Authentication → Sign-in method**: enable **Anonymous**.
   - **Authentication → Settings → Authorized domains**: include `alunos.leobottaro.com`.
   - **Google Cloud IAM & APIs (required for `createCustomToken` in `passkeyAuth`)**:
     - Enable the **IAM Service Account Credentials API** (`iamcredentials.googleapis.com`).
     - In **IAM & Admin → IAM**, grant the Cloud Functions runtime service account (`1088327344408-compute@developer.gserviceaccount.com`) the **`Service Account Token Creator`** (`roles/iam.serviceAccountTokenCreator`) role.
   - Populate `.env` with `VITE_FIREBASE_*` keys and `VITE_TURNSTILE_SITE_KEY`, and `functions/.env` with:
     ```env
     WEBAUTHN_RP_ID=alunos.leobottaro.com
     WEBAUTHN_ORIGIN=https://alunos.leobottaro.com
     TURNSTILE_SECRET=<your-turnstile-secret>
     TURNSTILE_HOSTNAMES=alunos.leobottaro.com
     ```
   - Optional: enable a Firestore TTL policy on `webauthn_challenges.expireAt` so unverified WebAuthn challenges are automatically purged.
2. **Cloudflare (`leobottaro.com` zone)**:
   - Authenticate Wrangler once (`npx wrangler login`).
   - [wrangler.jsonc](wrangler.jsonc) binds `alunos.leobottaro.com` (`custom_domain: true`) and sets `FIREBASE_FUNCTIONS_BASE_URL` to `https://southamerica-east1-classroom-attendance-a03af.cloudfunctions.net`.

## Updating & Redeploying

Follow these steps whenever you modify any part of the system.

### 1. Updating the Frontend PWA or Cloudflare Worker

Applies to changes in `src/`, `public/`, `vite.config.ts`, `.env`, `worker/index.ts`, or `wrangler.jsonc`:

```bash
# 1. Run tests & verify production build
npm test
npm run build

# 2. Validate Worker bundle and asset manifest locally
npx wrangler deploy --dry-run

# 3. Build & deploy to https://alunos.leobottaro.com
npm run deploy:cf
```

> **Note**: [worker/index.ts](worker/index.ts) automatically serves `/sw.js` with `Cache-Control: no-cache, no-store, must-revalidate` and `*.wasm` with `Content-Type: application/wasm` so PWA updates propagate cleanly through Cloudflare's edge.

### 2. Updating Firebase Cloud Functions (`southamerica-east1`)

Applies to changes in `functions/src/` or `functions/.env`:

> **Region Consistency**: `functions/src/index.ts` sets `setGlobalOptions({ region: 'southamerica-east1' })` and `src/lib/firebase/client.ts` initializes `getFunctions(appInstance, 'southamerica-east1')`. Keep both aligned if you ever change regions.

```bash
# 1. Run Cloud Functions tests & compile TypeScript
npm --prefix functions test
npm --prefix functions run build

# 2. Deploy Cloud Functions (and maintain Artifact Registry cleanup policy)
firebase use classroom-attendance-a03af
firebase deploy --only functions --force
```

If you deploy a new HTTP function URL or change the region, update `FIREBASE_FUNCTIONS_BASE_URL` in [wrangler.jsonc](wrangler.jsonc) and redeploy Cloudflare (`npm run deploy:cf`).

### 3. Updating Firestore or Storage Security Rules & Indexes

Applies to changes in [firestore.rules](firestore.rules), [firestore.indexes.json](firestore.indexes.json), or [storage.rules](storage.rules):

```bash
firebase use classroom-attendance-a03af
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 4. Post-Deploy Smoke Checks

After deploying updates to Firebase or Cloudflare, verify the live endpoints on `alunos.leobottaro.com`:

```bash
# SPA shell, service worker headers, and WASM MIME type
curl -sS -I https://alunos.leobottaro.com/ | head -n 5
curl -sS -I https://alunos.leobottaro.com/sw.js | grep -iE "^(http|cache-control)"
curl -sS -I https://alunos.leobottaro.com/zxing_reader.wasm | grep -iE "^(http|content-type)"

# Cloudflare -> Firebase Cloud Functions proxies (southamerica-east1)
curl -sS https://alunos.leobottaro.com/time
curl -sS -X POST https://alunos.leobottaro.com/api/passkey/login/options \
  -H "Content-Type: application/json" \
  -H "Origin: https://alunos.leobottaro.com" \
  -d '{}'
```

> **HTTPS Requirement**: WebAuthn passkeys, `getUserMedia` camera access, and WebCrypto require HTTPS (automatically provided by Cloudflare for `alunos.leobottaro.com`; `localhost` also works for local development).

### 5. Optional Hardening: Firestore TTL & App Check

Both are opt-in and configured outside the code deployment:

1. **TTL on `webauthn_challenges.expireAt`** (removes stale WebAuthn challenges automatically). There is no CLI command for TTL policies:
   - Firebase Console → Firestore Database → **Indexes** → **TTL policies** → **Create policy**
   - Collection group: `webauthn_challenges`, timestamp field: `expireAt`
   - The field is already written by `passkeyAuth`; no redeploy is required.

2. **Firebase App Check (reCAPTCHA v3)** — client support is built in but inert until you provide a site key:
   - Firebase Console → **App Check** → register the web app with **reCAPTCHA v3** (create the reCAPTCHA keys in the Google Cloud console first).
   - Add the public site key to `.env` as `VITE_APP_CHECK_SITE_KEY=...` and rebuild/redeploy Cloudflare (`npm run deploy:cf`).
   - For local development, App Check needs a debug token: set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before the app bundle loads, then register the printed token under App Check → Apps → Manage debug tokens.
   - Only enable **enforcement** for Firestore/Storage/Functions after every deployed client sends valid App Check tokens, otherwise older clients will be blocked.


