# AGENTS.md

Instructions and invariants for AI agents working in this repository.

## Deployment & Operations Reference

Always consult [README.md](README.md) (**Updating & Redeploying**) before modifying deployment configuration, Firebase Functions, Firestore rules, or Cloudflare Worker settings.

### Live Environments

- **Production Domain**: `https://alunos.leobottaro.com`
- **Cloudflare**:
  - Account ID: `cbccd23973b3b71b305a4e8efc1c4562`
  - Worker Name: `class-attendance-pwa` (`wrangler.jsonc` + `worker/index.ts`)
  - Deploy command: `npm run deploy:cf` (run `npm test`, `npm run build`, and `npx wrangler deploy --dry-run` first)
- **Firebase**:
  - Project ID: `classroom-attendance-a03af` (`.firebaserc`)
  - Region: **`southamerica-east1`** (São Paulo)
  - Both `setGlobalOptions({ region: 'southamerica-east1' })` in `functions/src/index.ts` and `getFunctions(appInstance, 'southamerica-east1')` in `src/lib/firebase/client.ts` must stay in sync with `FIREBASE_FUNCTIONS_BASE_URL` in `wrangler.jsonc`.
  - Deploy rules/indexes: `firebase deploy --only firestore:rules,firestore:indexes`
  - Deploy functions: `firebase deploy --only functions --force`

## Non-Negotiable Architecture Constraints

- **Offline-first PWA**: Every flow after initial student–teacher registration (student QR generation, teacher QR scanning & validation, local attendance queueing, and `exceljs` XLSX export) must work without network. Keep `/zxing_reader.wasm`, `exceljs`, and app chunks precached via `vite-plugin-pwa` in `vite.config.ts`.
- **Teacher Auth**: WebAuthn passkeys only (`passkeyAuth` Cloud Function minting custom tokens with `{ teacher: true }`). Never add email/password auth or account recovery.
- **Student Auth & Crypto**: Anonymous auth (`signInAnonymously`) at registration only; non-extractable ECDSA P-256 keys (`extractable: false`) stored as `CryptoKey` in IndexedDB (`student-private-key`). Never allow client registration to overwrite an existing key outside `/student/recover`.
- **Firestore Rules & Collections**:
  - Never allow client-side `update`/`delete` on `students` or `classes`, and never allow `list` on `students`.
  - Do not introduce `sessions` or `keyRotationRequests` collections, Firebase Storage, or manual "add student by ID" UI.
  - Keep `functions/.env` (`WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`) and `.env` gitignored.

## Verification & Git Workflow

- Run both test suites and both builds after code changes:
  - `npm test && npm --prefix functions test`
  - `npm run build && npm --prefix functions run build`
- Commit logical changes cleanly and push to `origin main`.
