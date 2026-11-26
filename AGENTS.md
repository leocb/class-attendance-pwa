# AGENTS.md

Instructions and invariants for AI agents working in this repository.

## Deployment & Operations Reference

Always consult [README.md](README.md) (**Updating & Redeploying**) before modifying deployment configuration, Firebase Functions, Firestore/Storage rules, or Cloudflare Worker settings.

### Live Environments

- **App Name**: `Class Attendance` (localized in `en` and `pt-BR`)
- **Production Domain**: `https://alunos.leobottaro.com`
- **Cloudflare**:
  - Account ID: `cbccd23973b3b71b305a4e8efc1c4562`
  - Worker Name: `class-attendance-pwa` (`wrangler.jsonc` + `worker/index.ts`)
  - Deploy command: `npm run deploy:cf` (run `npm test`, `npm run build`, and `npx wrangler deploy --dry-run` first)
- **Firebase**:
  - Project ID: `classroom-attendance-a03af` (`.firebaserc`)
  - Region: **`southamerica-east1`** (São Paulo)
  - Both `setGlobalOptions({ region: 'southamerica-east1' })` in `functions/src/index.ts` and `getFunctions(appInstance, 'southamerica-east1')` in `src/lib/firebase/client.ts` must stay in sync with `FIREBASE_FUNCTIONS_BASE_URL` in `wrangler.jsonc`.
  - Deploy rules/indexes: `firebase deploy --only firestore:rules,firestore:indexes,storage`
  - Deploy functions: `firebase deploy --only functions --force`

## Non-Negotiable Architecture Constraints

- **Offline-first PWA**: Every flow after initial student–teacher registration (student QR generation, teacher QR scanning & validation, local attendance queueing, cached selfie rendering, and `exceljs` XLSX export) must work without network. Keep `/zxing_reader.wasm`, `exceljs`, and app chunks precached via `vite-plugin-pwa` in `vite.config.ts`.
- **Teacher Auth**: WebAuthn passkeys only (`passkeyAuth` Cloud Function minting custom tokens with `{ teacher: true }`). Never add email/password auth or account recovery.
- **Student Auth & Crypto**: Anonymous auth (`signInAnonymously`) at registration only; non-extractable ECDSA P-256 keys (`extractable: false`) stored as `CryptoKey` in IndexedDB (`student-private-key`). Never allow client registration to overwrite an existing key outside `/student/recover`.
- **Selfie Storage & Compact QR**:
  - Student selfies (512×512 WebP, ≤ 1 MB) live in Firebase Storage at `selfies/{sid}/{fp}.webp` (`storage.rules`), NOT inside the QR payload.
  - QR payloads sign `sh` (SHA-256 hex of the WebP bytes) inside `v1|sid|n|ts|nce|fp|sh`; the payload always carries the student public key (`pk`) so scan-time key rotation is possible.
  - Teacher devices download & hash-verify selfies on first scan / rotation and cache them in IndexedDB (`cache:selfies`) for offline scanning and roster views.
- **Firestore Rules & Collections**:
  - Never allow client-side `update`/`delete` on `students` or `classes`, and never allow `list` on `students`.
  - Do not introduce `sessions` or `keyRotationRequests` collections or manual "add student by ID" UI.
  - Keep `functions/.env` (`WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES`) and `.env` gitignored.
- **Bot Protection**: Teacher passkey login/registration and online student registration/recovery use Cloudflare Turnstile (`TurnstileWidget` + server-side `verifyTurnstileToken` checking `success`, `action`, and `TURNSTILE_HOSTNAMES`).
- **Dev test login**: `passkeyAuth` exposes `/api/passkey/dev/login` only when `DEV_LOGIN_SECRET` is set (404 otherwise) and only for the fixed `DEV_LOGIN_UID`. The Vite dev middleware brokers it; the button renders solely in `vite dev` on localhost. Remove `DEV_LOGIN_SECRET`/`DEV_LOGIN_UID` from `functions/.env` and `.env.local`, then redeploy, before launch.


## Localization (Non-Negotiable)

- Every user-facing string — headings, buttons, labels, placeholders, `alt`/`aria-label` text, banners, toasts, and **error messages** — must come from `src/lib/i18n` via `t('key')` and exist in both `en` and `pt-BR`. Never hardcode English text in JSX.
- Never render raw library or Cloud Function error text (`err.message`, `HttpsError` messages) in the UI. Throw `LocalizedError('errKey')` from `src/lib/errors.ts`, or resolve with `errorMessage(err, t, 'errFallback')`, which logs the raw error and renders a translated message.
- The app name itself is localized (`appName`): `Class Attendance` (EN) / `Presença na Sala` (PT-BR).
- Registered students land on `/student/qr` when opening the app; the QR screen exposes an options button (bottom right) back to `/`.


## Verification & Git Workflow

- Run both test suites and both builds after code changes:
  - `npm test && npm --prefix functions test`
  - `npm run build && npm --prefix functions run build`
- Commit logical changes cleanly and push to `origin main`.
