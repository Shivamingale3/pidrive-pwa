# PiDRIVE Vault — Decision Log

Living record of locked architectural and product decisions.
Sections are appended here only after being explicitly locked in discussion.
Once all sections are locked, this file becomes the project context for development.

Status legend:
- **LOCKED** — settled, do not revisit without an explicit decision to reopen
- **OPEN** — still under discussion
- **DEFERRED** — intentionally postponed, tracked as future scope

---

## Section 1 — Project Description — LOCKED

PiDRIVE Vault is a secure, offline-first password and notes vault built as a
Progressive Web App (PWA). The PWA is the only client, now and later.

### Purpose

1. Personal vault for a small closed group (~3–5 people)
2. Learning vehicle
3. Portfolio/resume showcase demonstrating offline-first architecture

### Responsibility split

**Client** owns:
- local vault operation
- local persistence
- all cryptography
- offline-first behaviour

**Server** is a dumb encrypted-data store. Its only jobs:
- account and authentication APIs
- device public key registry
- storage of the wrapped Vault Encryption Key
- sync push/pull of encrypted vault records

The server never receives keys or plaintext and cannot decrypt anything.
A full server breach yields ciphertext only.

The server exists for **durability** — the vault survives the client being
wiped from the user's device. It is not a business-logic tier and performs no
per-record CRUD on meaningful data.

### Product shape

- One account, one vault
- Multiple devices per account, required from day one
- Notes and passwords are two separate RxDB collections
- Registration is closed; accounts are created manually
- First run requires network; after that the vault is fully usable offline

### Multi-device onboarding

A new device obtains the Vault Encryption Key by the user entering the
**Recovery Key** on that device, which unwraps the vault key pulled from the
server.

Consequences:
- The Recovery Key is a **routine-use** item, not break-glass only. The user
  needs it every time a device is added. This must be reflected wherever the
  Recovery Key is presented to the user.
- No per-device *encryption* key pair is required. The ECDSA signing key pair
  (Section 12) remains sufficient, since device-to-device key wrapping is not
  used.

### Threat model

Defending against:
1. Server operator or server database breach
2. Stolen unlocked device
3. Malicious browser extension or XSS (cross-site scripting) on the page

Order of work: **build first, harden second.** Hardening is a deliberate later
phase, not skipped.

Known limitation to revisit in the hardening phase: hostile JavaScript running
inside the app's own origin while the vault is unlocked can use the live
decrypted key regardless of non-extractability. Mitigation is blast-radius
reduction (strict CSP, no third-party scripts/CDNs, minimal dependencies,
auto-lock), not elimination.

### Deferred — future scope

- **Guest/demo user** — single active device session at a time, roughly one day
  lifetime, full feature demo intended for recruiters. Mechanism undecided.
- **Media phase** — server-stored, internet-dependent. Storage and encryption
  approach undecided.
- **XSS hardening specifics** — CSP, dependency minimisation, auto-lock timing.

---

## Section 2 — Core Technology Stack — LOCKED

Versions below are the actual installed versions read from `package.json`, not
aspirational ones.

### Frontend

| Concern | Choice |
| --- | --- |
| UI | React 19.2 |
| Language | TypeScript 7 (`typescript@^7`, Go-native compiler) |
| Build | Vite 8.2 |
| Optimisation | React Compiler (deliberate — auto-memoises, so no hand-written `useMemo`/`useCallback`) |
| Validation | Zod 4.5 |
| IDs | ULID 3.0 |
| HTTP | axios — chosen, **not yet installed** |

### Client database

```
RxDB 17.5
  ↓
Dexie storage adapter
  ↓
IndexedDB
```

RxDB is the application-facing client database layer. Application code must not
use raw IndexedDB APIs.

A direct `dexie` package is **not** installed and is not required.
`rxdb/plugins/storage-dexie` bundles what it needs. A direct `dexie` dependency
would only be justified for writing raw Dexie queries, which this architecture
forbids.

**Free / open-source RxDB only — hard constraint.** No RxDB premium packages.

Consequence to carry into Sections 14 and 18: RxDB's encryption plugin is a
premium product, therefore **vault encryption must be hand-rolled with Web
Crypto at the repository layer** — encrypt before writing to RxDB, decrypt
after reading.

### Backend

Python · FastAPI · PostgreSQL · SQLAlchemy

### Zod's role

Form/user input validation and any boundary needing strict types. Already used
for build-time env validation (`src/validation/env.validation.ts`, consumed by
`vite.config.ts` via Vite's `loadEnv`).

Zod does **not** replace RxDB's collection JSON schema. RxDB enforces its own
schema; the two coexist and serve different layers.

### TanStack Query — REJECTED

Dropped. Server data is sync-only and RxDB is the local database, so there is no
server-state cache worth maintaining. axios alone is sufficient for the small
set of one-shot API calls (login, device registration, key fetch).

### TypeScript 7 — the alias is deliberate, do not "clean it up"

`package.json` intentionally contains:

```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2"
```

This is Microsoft's sanctioned side-by-side arrangement, not leftover scaffold
noise. It gives simultaneously:

- `tsc` → real TypeScript 7 (Go-native, 8–12x faster) for `npm run build`
- the `typescript` package name → the TypeScript 6.0 API that tooling reads

**Why it cannot be removed yet.** TypeScript 7's programmatic API is not stable
(expected in 7.1). `typescript-eslint` talks to that API rather than to the
type-checker directly, and its published peer range is `>=4.8.4 <6.1.0`, which
excludes TypeScript 7 entirely.

This was tested on this project. Removing the alias produces:

```
npm error ERESOLVE unable to resolve dependency tree
npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.69.0
```

`--force` / `--legacy-peer-deps` is not a workaround — install then succeeds but
ESLint crashes inside `typescript-estree`. A TypeScript 7.0.2 support issue was
filed against typescript-eslint on GA day (8 July 2026) and closed as
"not planned".

**Revisit when TypeScript 7.1 ships the stable API.** Until then the alias
stays.

Separate note: neither `tsconfig.app.json` nor `tsconfig.node.json` sets
`"strict": true`. TypeScript 7 makes `strict` the default, so previously-hidden
type errors surface when building with `tsc`. This is desirable, not a
regression.

### Open items

- **No PWA tooling installed.** No `vite-plugin-pwa`, no manifest, no service
  worker. Without a service worker this is a website using IndexedDB, not an
  installable offline app. Deferred to the PWA install/environment gate work
  tracked in Section 21.

### Removed dependencies

- **`dotenv` — removed.** It is a Node.js package (reads `.env` from disk via
  `fs`, writes to `process.env`) and cannot run in a browser. `vite.config.ts`
  already uses Vite's native `loadEnv`. If the FastAPI backend needs equivalent
  behaviour, that is Python's `python-dotenv` in the backend repo, unrelated to
  this package.

### Client env var rule

Vite only exposes variables prefixed `VITE_` through `import.meta.env`, and
anything exposed that way is **baked into the shipped JS bundle and readable by
anyone**. Therefore: no secret of any kind may live in a `VITE_` variable.
Non-sensitive configuration only (e.g. API base URL).
