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

1. Create a Firebase project with **Firestore (Native mode)** and **Authentication** (enable **Anonymous** sign-in provider).
2. Deploy Firestore rules & indexes, Cloud Functions, and Hosting:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

> **HTTPS Requirement**: WebAuthn passkeys, `getUserMedia` camera access, and WebCrypto require HTTPS (automatically provided by Firebase Hosting; `localhost` also works for local development).
