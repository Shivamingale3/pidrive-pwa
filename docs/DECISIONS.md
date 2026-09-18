# PiDRIVE Vault — Decision Log

Living record of locked architectural and product decisions.
Sections are appended here only after being explicitly locked in discussion.
Once all sections are locked, this file becomes the project context for development.

Status legend:
- **LOCKED** — settled, do not revisit without an explicit decision to reopen
- **OPEN** — still under discussion
- **DEFERRED** — intentionally postponed, tracked as future scope

> **The existing `src/` is a throwaway spike.** The Notes module, schema,
> repository, provider and hooks were built only to validate RxDB and the
> layering. Once every section here is locked, the application is rewritten from
> scratch against this document. Do not treat current code as a constraint.

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

---

## Section 3 — Current Packages — DROPPED

Merged into Section 2. A hand-maintained package list in a decision doc goes
stale on the next `npm install`; `package.json` is the source of truth for
versions. Only the *rationale* was worth keeping, and it now lives in Section 2.

---

## Section 4 — Application Architecture — LOCKED

### Layers

```
React components
      ↓
React hooks          (useNotes)
      ↓
Services             (encrypt / decrypt, domain logic)
      ↓
Repositories         (persistence only — never touch crypto)
      ↓
RxDB
      ↓
Dexie storage → IndexedDB
```

Rules:
- Repositories deal in data and the database only. They never encrypt,
  decrypt, or hold keys.
- Services are the **only** layer that performs cryptography.
- Components never see RxDB types and never see ciphertext.

### Composition root — `AppDatabase`

`AppDatabase`:
- creates the RxDB instance
- registers collections
- constructs repositories
- wraps repositories in services
- exposes **only services**

The `RxDatabase` instance and the repositories are both **private**. This is
deliberate: a public `RxDatabase` would let any component call
`db.database.notes.find(...)` and bypass both the repository and encryption.

`AppDatabase.create()` remains singleton-safe (cached promise), preventing
duplicate RxDB instances.

### Reactive reads

Services expose their own observables. A service `findAll$()` pipes the
repository's RxDB stream through decryption and emits plaintext domain objects.
Hooks subscribe to the **service**, never to the repository.

Implementation constraint: decryption is async (Web Crypto returns Promises),
so the pipe needs an async operator (`concatMap` / `mergeMap`) rather than a
plain `map`, and must preserve emission order.

### Lock behaviour

When the vault locks, the vault key leaves memory and decryption becomes
impossible. Service streams stop emitting (or emit empty) and the UI falls to
the lock screen. Mechanism deferred to the PIN/unlock section.

### Encryption boundary

| Encrypted | Plaintext |
| --- | --- |
| `title`, `content`, password payloads | `id`, `createdAt`, `updatedAt`, `deletedAt` |

Titles are encrypted deliberately. A plaintext title leaks as much as the secret
itself ("HDFC net banking", "AWS root account"), and would break Section 1's
guarantee that a server breach yields ciphertext only.

Consequences that must be respected everywhere:
1. **No index on any encrypted field.** The `title` index must be removed from
   `Note.ts`. Only date fields remain indexable.
2. **Search is in-memory after decryption.** No RxDB query can filter or sort on
   title or content. Sorting by date still works at the database level.
3. **Equality matching on encrypted fields is impossible.** AES-GCM with a fresh
   IV per operation means identical plaintext produces different ciphertext
   every time — this is not merely slow, it cannot work at all.

### Schema validation

**Always on**, in development and production, via RxDB's Ajv validator wrapping
the Dexie storage. Without a validator wrapper RxDB does not enforce the JSON
schema at runtime. Bundle-size and write-speed cost accepted.

### Folder layout

Crypto and domain services share `services/`:
`encryption.service.ts` alongside `note.service.ts`.

### Open items deferred to Section 9 (Synchronization)

- Custom `deletedAt` field vs RxDB replication's own `_deleted` flag — two
  separate mechanisms that need reconciling.
- No purge policy for soft-deleted rows. Deleted secrets currently persist on
  disk indefinitely.

### Note on the current schema

The existing `Note` schema is a **scaffold** built to exercise the architecture
and the database layer. It is not the final vault model. Real collection design
is a later section.

### Code fix applied during this section

`src/database/schemas/Note.ts` — `deletedAt.type` was `["string", null]` (the
JavaScript value `null`); corrected to `["string", "null"]`, since JSON Schema
expects the string `"null"`.

---

## Section 5 — React Database Integration — LOCKED

### Provider stack

```
ErrorBoundary
  └── PwaGate                installed PWA? if not: "Only PWA allowed"
        └── TrustProvider    trust store (plain IndexedDB) read,
                             persist() requested,
                             account session, device identity key,
                             PIN + biometric verification,
                             unwraps the Vault Key
              └── VaultProvider   receives the Vault Key, opens the RxDB
                                  vault database, builds services
                    └── App
```

**There is no DatabaseProvider.** The RxDB vault database is opened by
VaultProvider *after* unlock, not at app start. Before unlock it would be
unusable — every record in it is ciphertext and no Vault Key exists. The trust
store needs no provider at all: it is plain IndexedDB via `idb-keyval`
(Section 6), read directly by TrustProvider.

### Responsibility split

**TrustProvider** owns everything trust-related — account session, device
identity key, PIN and biometric verification, unwrapping the Vault Key — and
hands the raw Vault Key down.

**VaultProvider** performs no crypto verification. It receives the key and
constructs services with it.

The line: Trust decides *whether you get in*. Vault decides *what you can do
once you are in*.

### Service construction — built only after unlock

`AppDatabase` builds only RxDB and repositories at startup. It exposes a
factory:

```ts
AppDatabase.createServices(vaultKey)
```

VaultProvider calls it on unlock, puts the returned services into its context,
and **drops them on lock** — which tears down their RxDB subscriptions
automatically, satisfying the Section 4 lock behaviour with no extra code.

Repositories and the `RxDatabase` instance stay private on `AppDatabase`. The
factory is the only route by which services come into existence.

**Why this shape and not the alternatives.** A service cannot be constructed
without a Vault Key, so "locked" is unrepresentable rather than merely handled —
TypeScript enforces the rule instead of developer discipline. The two rejected
alternatives were:

- *A mutable key holder* passed to services at startup and filled on unlock.
  Workable, but "locked" becomes a runtime throw; nothing prevents calling a
  service before unlock, and the failure surfaces in front of a user.
- *Passing the key to every method.* Forces hooks and possibly components to
  hold the Vault Key, directly against the design goal that it lives in exactly
  one place and is erased on lock. Also fits observables badly — a stream needs
  the key at subscribe time, not per call.

`useNoteService()` throws outside an unlocked vault, mirroring how
`useDatabase()` throws outside its provider.

### Screens

No provider renders bare `null` while initialising. Planned states: splash,
loading, empty, error, fatal.

### Error handling

An ErrorBoundary sits above the whole tree with a real error UI. This matters
more than it appears: IndexedDB is genuinely unavailable in Firefox private
browsing and under some Safari storage restrictions. For an offline-first vault
that is fatal and needs an explicit message, not a white screen.

### Cleanup applied during this section

- `contexts/database.context.tsx` → `.ts` (contained no JSX)
- Default exports → named exports for `DatabaseContext`, `useDatabase`,
  `DatabaseProvider`
- `useDatabase.ts` uses `import type` for `AppDatabase`, so
  `verbatimModuleSyntax` does not retain a runtime import

---

## Section 6 — RxDB Usage & Storage Layout — LOCKED

### Two separate stores

**Trust store** — plain IndexedDB via `idb-keyval`, its own database.

Holds:
- device identity private key handle (`CryptoKey`)
- device wrapping key handle (`CryptoKey`)
- PIN-wrapped Vault Key blob
- biometric-wrapped Vault Key blob
- salts and iteration counts

Must be readable **before** unlock. Needs no reactivity, no queries, no sync.

**Why not RxDB — this is a hard constraint, not a preference.** RxDB documents
must be JSON; it validates them against a JSON schema (always-on per Section 4)
and computes revision hashes by serializing them. A `CryptoKey` has no
serializable content — `JSON.stringify(cryptoKey)` returns `{}`. Storing one in
RxDB fails validation, and even if it did not, RxDB's cloning and hashing would
destroy the handle.

Plain IndexedDB works because it uses the structured clone algorithm, which
supports `CryptoKey` as a native type. RxDB sits on top of IndexedDB but imposes
the JSON constraint that breaks it.

**Vault database** — RxDB, holding encrypted vault records. Opened and used only
after unlock. This is where RxDB's reactivity, querying and replication earn
their place.

Side benefit of the split: the vault database can be dropped and rebuilt during
recovery without touching device keys.

### Record shape — one encrypted blob per record

```
{
  id, createdAt, updatedAt, deletedAt,     ← plaintext, queryable
  payload: { ciphertext, iv }              ← everything secret, one lump
}
```

All secret fields are serialized to JSON, encrypted once, and stored as a single
field with its IV (initialization vector — random bytes, fresh per encryption,
stored alongside because decryption requires it).

Consequences:
- Adding or changing a secret field never touches the RxDB schema, because the
  shape lives inside the encrypted JSON where RxDB cannot see it.
- An attacker sees one opaque blob per record — no field structure leaked, no
  per-field ciphertext-length hints.
- All-or-nothing decryption: reading a title decrypts the password too.
  **Accepted.**

Per-field encryption was considered and rejected. Its only real gain is
selective decryption, which is worth little here — the list view needs titles
from every record anyway, and an opened record is fully in memory regardless.
Its costs are an IV per field, a schema field per secret field (so a migration
every time the shape changes), and leaked value lengths.

### Migrations — never migrate encrypted content

RxDB runs schema migrations at **database open**, which is before unlock, when
no Vault Key exists:

```
app opens → RxDB opens → migration runs   ← no Vault Key yet
                              ↓
                        needs to decrypt
                              ↓
                          impossible
```

The single-blob shape removes the problem rather than solving it. RxDB schema
changes can only ever involve plaintext metadata, which never needs decrypting.

The payload's internal shape carries its own `v` field **inside** the encrypted
JSON, and records are upgraded lazily as they are decrypted.

### Querying

Only `id` and the timestamps are queryable. Encrypted fields cannot be indexed,
filtered, or sorted — and AES-GCM's fresh IV per operation means identical
plaintext produces different ciphertext every time, so even equality matching is
impossible.

Every list view therefore: fetch records sorted by date → decrypt in memory →
filter and search in JavaScript. **Accepted at this scale.**

### New dependency

`idb-keyval` — ~600 bytes, by Jake Archibald. API is `get` / `set` / `del` /
`keys`, a thin promise wrapper over IndexedDB, so structured clone applies
directly and `CryptoKey` handles survive it.

```js
import { createStore, get, set } from 'idb-keyval';

const trustStore = createStore('pidrive-trust', 'trust');

await set('deviceKey', keyPair.privateKey, trustStore);
const key = await get('deviceKey', trustStore);   // CryptoKey back
```

`createStore` keeps it in its own database, separate from the RxDB vault
database.

---

## Section 7 — React Hooks — LOCKED

### Consolidated domain hooks

One hook per domain, exposing the whole surface:

```
useNotes({ search })
├── data
├── loading
├── error
├── getById()
├── create()
├── update()
└── remove()
```

No `useCreateNote` / `useUpdateNote` / `useGetNote` split — that multiplies into
a hook per operation per domain for no benefit.

```
React component
   ↓
useNotes()
   ↓
NoteService   (decrypt / encrypt, cache, filter)
   ↓
NoteRepository
   ↓
RxDB
```

### Hook return shape

Every domain hook returns `{ data, loading, error }` alongside its operations.
Decryption sits in the read path, so both loading and error are real states, not
ceremony.

`loading` is **initial load only** — true before the first emission of the
stream, false thereafter. Mutations do not toggle it; the reactive stream
re-emits when a write lands.

### Search

`useNotes({ search })` — the hook takes filter arguments and passes them to the
service. **The service performs the filtering**, since it owns the cache of
decrypted records and filtering anywhere else would mean handing plaintext
upward just to filter it.

**No debounce.** With the cache warm, filtering is an in-memory array filter over
already-decrypted records — cheap enough to run per keystroke.

### Decryption cache

A plain `Map` held **as a field on the service**:

```ts
private cache = new Map<string, DecryptedNote>();
// key: `${id}:${updatedAt}`
```

A changed record gets a new `updatedAt`, so its key changes, the old entry
becomes unreachable and only the changed record is re-decrypted. Without this,
every emission of the RxDB stream would re-decrypt every record, since any
single write re-emits the whole list.

**Unbounded.** No LRU eviction at this scale.

**Lifetime is the service's lifetime.** VaultProvider drops the services on lock
(Section 5), so the cache becomes unreachable and dies with them. There is no
clear-the-cache call that can be forgotten.

### TanStack Query — rejected a second time

Reconsidered as a decryption cache (not as an API cache) and rejected again:

1. **It does not memoize per record.** It caches query *results*. One list query
   means one cache entry for the whole list — change one record and the whole
   list re-decrypts, which is the exact cost the cache exists to avoid. Getting
   per-record behaviour needs `useQueries` with `['note', id, updatedAt]` keys:
   substantial machinery for what a `Map` does in ten lines.
2. **Push/pull mismatch.** TanStack Query pulls via a query function; RxDB
   pushes on change. Bridging them means subscribing and calling
   `setQueryData` per emission — at which point it is a `Map` being written to
   manually, minus the refetching, staleness and retry features being paid for,
   none of which apply to a local database.
3. **It survives lock.** The `queryClient` lives in React, above the services,
   and its cache holds **decrypted vault data**. Unless `queryClient.clear()` is
   called explicitly on every lock path, plaintext notes and passwords remain in
   memory after locking. The service-owned `Map` cannot have this bug.

### Trust hooks

`useTrust()` from TrustProvider, same consolidated pattern:

```
useTrust()
├── isUnlocked
├── unlock()
├── lock()
├── changePin()
├── registerDevice()
└── recoveryKey
```

Provisional — this surface is an assumption and will be revised when the trust
flows are actually implemented.

---

## Section 8 — Offline-First Architecture — LOCKED

### What requires network

Only two things:
1. **New device login / setup** — account authentication, device registration,
   fetching the recovery-wrapped Vault Key.
2. **Sync** — RxDB replication push/pull.

Everything else works offline indefinitely, including **daily unlock**. Unlock
needs nothing from the server: the wrapped Vault Key blob, salts and iteration
counts are in the local trust store, and the device wrapping key is in the
browser.

### No sessions, no expiry

There is **no session concept**. Authentication is per-request payload signing
with the device private key, verified server-side against the registered public
key. Nothing expires, so an offline device never degrades.

**Offline duration is unlimited.** Offline forever is a supported state.

> **OPEN — replay protection.** With no session, the server needs a way to
> reject a captured signed request being replayed. Standard approaches are a
> server-issued nonce or a timestamp inside the signed payload. Deferred to the
> auth-protocol section.

### No per-operation online checks

Application code must never contain:

```js
if (navigator.onLine) { await api.post(...) }
```

for vault mutations. Writes go to RxDB; replication moves them when
connectivity exists.

### Boot sequence

```
app load
  → PWA installed? no → "Only PWA allowed" screen, stop
  → yes → splash
       → read trust store
       → is this device set up?  no → account login + setup flow
       → yes → unlock screen (biometric primary, PIN fallback)
            → unlock → open RxDB vault database → build services
                 → app
```

The PWA check is the **first** thing on load. Nothing else initialises until it
passes.

Dependency: an offline launch needs the service worker to have cached the app
shell. Service worker caching is currently unbuilt — tracked in the PWA section.

### Auto-lock

**Trigger: page hidden only.** The app locks when the page becomes hidden — user
switches app or tab. **There is no timer of any kind**, and no configurable
duration.

On mobile this is partly reinforced for free: backgrounding a PWA often gets the
tab discarded by the OS, wiping memory and locking it regardless.

**Lock discards unsaved form state.** In-progress typing is lost. Preserving it
would mean plaintext vault data surviving the lock, which defeats the point.

What lock does mechanically (per Section 5): VaultProvider drops the services,
which kills the Vault Key and the decryption cache in one step.

**Re-unlock** uses biometric if configured as primary, with PIN fallback — the
same path as initial unlock.

> **OPEN — idle-while-visible.** With hidden-only triggering, an app left open
> and untouched stays unlocked indefinitely. On a phone the screen sleeps and
> the PWA hides, so this rarely bites. On desktop it means an unlocked vault on
> an unattended screen. Deliberately left open; revisit once the app is built.

---

## Section 9 — Synchronization — LOCKED

### Architecture

```
                 PWA
                  │
                 RxDB
              ┌───┴───┐
              │       │
           Local   Replication
           state       │
              │        │ HTTP (signed requests)
          IndexedDB    ▼
                   FastAPI
                      │
                  PostgreSQL
```

The backend does **not** run RxDB. It implements the HTTP contract RxDB
replication expects — push/pull with checkpoints.

**What syncs: vault records only.** The recovery-wrapped Vault Key blob is
uploaded once during setup and is not part of replication. Nothing else from the
trust store ever leaves the device.

### Deletion — permanent, no recycle bin

Deletion is **immediate and permanent**, guarded by a confirmation dialog only.
There is no recycle bin, no trash, no undo.

| Field | Meaning |
| --- | --- |
| `_deleted: true` | permanently deleted — RxDB tombstone, excluded from queries |

No `deletedAt` field on vault records. A recycle bin was considered and dropped
to match the designs, which specify permanent delete with confirm.

**Tombstones are still required** — see below. They are a sync mechanism, not a
trash feature.

### Tombstones

When a record is permanently deleted, the row is **not** removed. It is kept
flagged `_deleted: true`, with the **encrypted payload stripped**. A tombstone
retains only `id`, `_deleted` and revision metadata — a few dozen bytes carrying
nothing sensitive. Keeping the ciphertext would leave a deleted password's
encrypted content on the server indefinitely.

**Why tombstones are required — the resurrection problem:**

```
Day 1    phone, laptop, tablet all have note X
Day 2    phone permanently deletes X
         → server and laptop drop it
         → tablet is offline, hears nothing
Day 180  tablet syncs
         → "I have X, you don't — take it"
         → X resurrects everywhere
```

The tablet is not malfunctioning: pushing records the server lacks is exactly
what sync does. Without a marker it cannot distinguish "deleted while I was
away" from "new, never seen". The tombstone answers its push with "known,
deleted", so the tablet deletes its copy instead.

**Tombstones are kept indefinitely.** Purging them reopens the resurrection
window for any device offline longer than the retention period. At this scale
the storage cost is negligible. (Same problem distributed databases solve with
retention windows — Cassandra's `gc_grace_seconds` is the canonical example.)

### Conflict resolution — last write wins

Highest `updatedAt` wins. **No conflict UI, no conflicts collection, no warning,
no duplicate copies.** The losing version is discarded.

Conflict resolution is necessarily **client-side**: the server sees only
ciphertext and cannot merge fields or inspect content. "Server always wins" was
never available as an option.

Accepted consequence: an edit made on two devices while both were offline loses
one version silently. Auto-sync on app open keeps drift small enough that this
is rare.

### When sync runs

| Trigger | Blocking? |
| --- | --- |
| App open, if online | **Yes** — full-screen loader |
| Manual button in settings | **Yes** — full-screen loader |
| After a local write, if online | No — silent background push |

**Offline means no sync, so the app opens normally.** The blocking loader only
appears when sync actually runs. This preserves Section 8's guarantee that
offline operation is unlimited and fully supported.

**Timeout: 60 seconds.** If a blocking sync exceeds it, the app proceeds offline
with a sync-failed notice rather than trapping the user behind a loader.

**On sync failure** — server error, signature rejection, network drop — show the
error and let the user continue into the app offline. Failure never blocks entry
to the vault.

The manual button exists mainly as insurance when switching devices.

### Rejected: blocking the app until sync completes unconditionally

Considered and rejected. It would break Section 8's core guarantee: no
connectivity means sync cannot run, which would leave the app blocked — and a
server outage would prevent every user from opening a vault that is sitting
decryptable on their own device. It also undercuts the portfolio purpose, since
an offline-first app that will not start without its server is the first thing a
reviewer would question.

---

## Design System — LOCKED

Source: `docs/design/*.dc.html` (Claude Design exports). Those files are the
visual source of truth; tokens below are extracted from them for Tailwind.

### Typography

- **Plus Jakarta Sans**, weights 400 / 500 / 600 / 700 / 800
- `ui-monospace` for numerals, countdowns, and small caps-tracked labels
- Tight tracking on headings: `letter-spacing: -0.03em` to `-0.04em`

### Colour

| Token | Value | Use |
| --- | --- | --- |
| ink | `#101010` | primary text, primary buttons |
| ink-dark-surface | `#0e0f11` | dark hero panels, success overlays |
| canvas | `#e7e5e0` | design canvas background |
| surface | `#ffffff` | screen background (light) |
| surface-subtle | `#f5f4f1` | input backgrounds, cards, disabled states |
| border | `#eceae5` | card and input borders |
| text-muted | `#77746e` | body copy, secondary |
| text-faint | `#a09d97` / `#a3a19c` | labels, placeholders |
| icon-muted | `#8d8a84` | input icons |
| on-ink | `#fefefe` / `#fdfdfd` | text on dark |
| error | `#c23c1a` | error accent (rust) |
| error-bg | `#fdeeea` | error banner background |
| error-text | `#8f2b12` | error banner text |

Both light and dark themes exist throughout the designs.

### Geometry

- Inputs: 58px tall, 18px radius, 1.5px border
- Primary buttons: 60px tall, fully pilled (30px radius)
- Cards / panels: 24–26px radius
- Small controls / icon buttons: 12–19px radius
- Primary button shadow: `0 10px 26px rgba(16,16,16,0.18)`
- Device frames: 402 × 874 (iOS), Android frame also provided

### Motion

Keyframes defined in the designs: `spin`, `rise` (8px translate + fade),
`shake` (error), `pulse`. All wrapped in a
`@media (prefers-reduced-motion: reduce)` override — **this must be carried into
the build.**

Libraries: **Motion** for real transitions, `tailwindcss-animate` for shadcn's
built-ins.

### Stack

- **Tailwind** — tokens above configured as theme values
- **shadcn/ui** — copied into the repo, owned locally. Used for dialogs, sheets,
  and other components not worth hand-writing
- **lucide-react** for UI icons; **Iconify** where coloured icons are wanted
- Hand-write where it is genuinely simpler; use the library where it is not

---

## Design Reconciliation — LOCKED

The designs were produced before these decisions were locked and disagreed in
several places. Resolutions:

| Conflict | Resolution |
| --- | --- |
| Biometric unlock had no screen | **No conflict.** The biometric prompt is OS-native (Android/iOS render their own and cannot be overridden). The designed PIN screen *is* the fallback, with a biometric re-trigger on it. |
| Design: forgot-password via 6-digit email OTP. Locked: Recovery Key | **Both.** They solve different problems — OTP recovers the **account password** on the server; the Recovery Key recovers the **vault**. Neither replaces the other. |
| Design: permanent delete. Locked: recycle bin | **Permanent delete wins.** Recycle bin dropped — see Section 9. |
| Escalating lockouts 30s → 5m → 1h | **Kept for both login and PIN.** For account login against the server this is a real control. For the PIN it is a **deterrent against a stolen or borrowed phone**, not a defence against a database dump — an attacker with the data never runs the app. Documented so this is not mistaken for cryptographic protection. |
| Private vault — second PIN, separate folder tree, invisible outside its gate | **Deferred to phase 2.** Not in scope for v1. |
| Login screen has "Create an account" | **Removed.** Registration is closed; accounts are created manually (Section 1). |
| Copy: "Your account lives on your Pi. Sign in and the app reads the vault straight from it." | **Copy rewrite.** Describes a server-backed app; the vault is read from local RxDB, never from the server directly. Wording only — no behaviour change. |
| Rich text notes (bold, lists, checkboxes) | **In scope.** Changes the note payload shape and adds an editor dependency. |
| No sync UI designed | **To be designed.** Blocking full-screen loader on app open, manual button in settings, 60s timeout, failure state. |

---

## Section 22 — Architectural Rules — LOCKED

Consolidated. Includes rules that emerged during discussion, not only those in
the original document. Two original rules changed meaning — marked below.

### Layering

- RxDB is the local vault source of truth.
- Hooks → services → repositories → RxDB. Never skip a layer.
- Services are the **only** layer that performs cryptography.
- Repositories never encrypt, decrypt, or hold keys.
- RxDB types never reach React components.
- `AppDatabase` exposes only services. Repositories and the `RxDatabase`
  instance stay private.
- Services cannot be constructed without a Vault Key.

### Cryptography

- Web Crypto only. No npm crypto packages.
- All cryptography is client-side.
- The PIN is never stored — not plaintext, **not even hashed**.
  *(Changed from the original "do not store plaintext PINs", which implied a
  hash was acceptable. Verification is attempting the unwrap.)*
- Wrap order is fixed: **PIN key inner, device key outer.** Never reverse it.
- The device private key is never wrapped, never backed up, never sent to the
  server.
- The device public key is stored plaintext and never wrapped.
- The Recovery Key never reaches the server.
- The Vault Key never reaches the server **in plaintext**. The recovery-wrapped
  blob does, by design.
  *(Changed from the original "do not send the Vault Encryption Key to the
  server", which as written would rule out the recovery path.)*
- The backend cannot decrypt vault contents.
- No new security secrets unless an implementation requirement genuinely
  demands one.

### Storage

- Trust material never goes in RxDB — `CryptoKey` cannot survive JSON
  serialization.
- No sensitive secrets in `localStorage`.
- No indexes on encrypted fields.
- Encrypted content is never migrated.
- Plaintext vault data and the live Vault Key exist only in memory, only while
  unlocked.
- No decrypted-data cache outlives the service that owns it.

### Offline and sync

- Application CRUD never depends on network availability.
- No per-operation `navigator.onLine` checks.
- RxDB replication handles synchronization; application code never pushes
  mutations manually.
- Sync failure or absence never blocks entry to the vault.
- Tombstones carry no payload.

---

## Section 21 — Implementation Status — REMOVED

Deleted rather than updated. The entire application is being rewritten against
this document, so a status list of the spike code has no forward value. Build
order will be derived from the locked sections when implementation starts.

---

## Still to design

- **Password / secrets collection** — what fields a password record actually
  holds.
- **Server API contract** — endpoints, request signing format, replay
  protection (see the OPEN note in Section 8).
- **Media architecture** — phase 2, server-stored, internet-dependent.
- **Guest / demo user** — single active device session, ~1 day lifetime.
- **Idle-while-visible auto-lock** — see the OPEN note in Section 8.
- **XSS hardening specifics** — CSP, dependency minimisation.

---

## Key & Crypto Architecture — LOCKED

Supersedes the original Sections 11–20. Where this section and the originals
disagree, this section wins.

### Ground rule

All cryptography uses **browser-native Web Crypto** (`crypto.subtle`). No npm
crypto packages. This is not a preference — a JavaScript library *cannot* offer
non-extractable keys, because that guarantee comes from the browser holding key
material outside JavaScript. A library is JavaScript.

### The secrets

| Secret | Generated | On client | On server |
| --- | --- | --- | --- |
| PIN (6 digits) | by user | never stored | never |
| PIN-derived key | derived at each unlock | memory only | never |
| Vault Key (AES-256-GCM) | client, random | encrypted blob | encrypted blob (recovery copy) |
| Recovery Key (16 chars) | client, random | never stored | never |
| Device identity pair (ECDSA P-256) | client | private: non-extractable handle | public: plaintext JWK |
| Device wrapping key (AES) | client | non-extractable handle | never |

### Why the Vault Key is encrypted twice

```
vault key
   ↓ encrypt with PIN-derived key      (inner — guessable secret)
   ↓ encrypt with device wrapping key  (outer — unguessable secret)
blob stored in IndexedDB
```

Unlock reverses it: the device key removes the outer layer automatically (the
browser already holds it), then the typed PIN removes the inner layer.

**Order is mandatory and must not be reversed.** AES-GCM fails loudly on a wrong
key, so a correct guess announces itself. With the PIN layer outermost, an
attacker holding a stolen database could brute-force the PIN and *know* when
they hit it — they still could not open the vault, but they would have learned
the PIN for later use against the physical device, and against whatever else the
user reuses it for. With the device layer outermost, every attempt fails
identically and the PIN never leaks.

Guessable secret innermost. Unguessable secret outermost.

### Why the device wrapping key is necessary

The KDF salt and iteration count are stored in **plaintext** beside the blob —
they must be, since the app needs them to reproduce the key. So an attacker with
a database dump has everything the KDF needs except the PIN itself.

A 6-digit PIN is 1,000,000 possibilities. At ~0.3s per PBKDF2 attempt that is
~3.5 days on one CPU and a few **hours** on a consumer GPU running attempts in
parallel. "Not stored" does not mean "not obtainable" — the PIN-derived key is
fully reconstructible from a guess.

The device wrapping key is not derived from anything guessable. It is random,
generated `extractable: false`, and stored in IndexedDB as a `CryptoKey` handle.
No browser API returns its bytes. A stolen database therefore contains a blob
whose outer layer cannot be attacked at all, and the PIN brute-force loop never
gets to run.

The two keys cover two different thefts:
- **Device key** defeats a stolen disk or database copy.
- **PIN** defeats a stolen *unlocked device*.

Neither is redundant.

### Non-extractable keys — what they are

`crypto.subtle.generateKey(..., extractable: false, ...)` returns a `CryptoKey`
that is a **handle**, not bytes. The real key material lives in the browser's
internal store.

- `exportKey()` and `wrapKey()` **throw** on such a key.
- The handle stores directly in IndexedDB — the structured clone algorithm
  supports `CryptoKey` natively. No serialization, no base64.
- It survives reload, app close, and reboot.
- Signing and wrapping happen **inside** the browser; the key never crosses back
  into JavaScript.

Mental model: it is a database *connection object*, not a database *password*.
You can use it; you cannot read the secret out of it.

Honest limit: this defeats JavaScript-level theft, including XSS. It is not an
absolute guarantee against an attacker with full OS access to the browser
profile directory.

### Device identity key pair

- ECDSA P-256 + SHA-256, generated `extractable: false`.
- Private half: handle in IndexedDB. **Never wrapped, never backed up, never
  sent to the server** — it cannot be, and should not be.
- Public half: exported as JWK, sent to the server, stored **plaintext**.
  Wrapping it would break the only thing it exists for; a public key can only
  verify.
- Purpose: sign request payloads so the server can verify the device.
- Device loss = key loss = that device's session ends. A new device generates a
  fresh pair and registers it. That is what device identity means.

### Three wrapped copies of the Vault Key

| Copy | Opened by | Stored | Purpose |
| --- | --- | --- | --- |
| Biometric | WebAuthn PRF-derived key | client | primary unlock |
| PIN | PIN key, then device key | client | fallback unlock |
| Recovery | recovery-key-derived key | server | new device / wiped storage |

Three independent locked boxes holding the same Vault Key. Any one opens it;
opening one reveals nothing about the others.

The **recovery copy is deliberately single-locked** — no device layer. It must
open on a fresh device that has no device key. That is its entire purpose.

### Key derivation

**PBKDF2-HMAC-SHA-256 for both the PIN and the Recovery Key.** Argon2id is
stronger against GPU attacks but needs a WASM dependency on the most
security-critical path, conflicting with the minimal-dependency stance in the
threat model. Deferred to the hardening phase.

HKDF was considered for the Recovery Key and **rejected**: HKDF assumes input
that is already strong (~128+ bits). A 16-character Crockford Base32 recovery
key is ~80 bits — not brute-forceable, but below that line, so the slow KDF is
correct. One KDF path for both is also simpler to audit.

Every wrap uses a unique random salt, stored plaintext beside the blob.

### PIN

- **6 digits.**
- **Not stored in any form — no hash.** Verification is attempting the unwrap;
  AES integrity checking means a wrong PIN fails. A stored hash would be an
  extra attackable artifact for no benefit.
- PIN change re-wraps the local blob only. The server's recovery copy is
  untouched, being wrapped by the recovery key.

### Recovery Key

- 16 characters, Crockford Base32 (A–Z + 0–9 minus I, L, O, U to avoid
  lookalikes) — ~80 bits.
- Displayed as `XXXX-XXXX-XXXX-XXXX`.
- Generated **on the client**, wrapping done **on the client**; only the
  resulting blob is uploaded. The server never sees the key.
- Shown once at setup; the user stores it offline.
- **Routine-use item**, not break-glass — required for every new device.
- Protects the Vault Key only. Nothing else has a recovery path.

### Biometric unlock (WebAuthn PRF)

Biometric is the **primary** unlock path; PIN is the fallback. Both built now.

Platform reality:
- Android has the most robust PRF support; passkeys in Google Password Manager
  include it by default.
- Apple: works with iCloud Keychain platform passkeys via Face ID / Touch ID in
  Safari 18+. **Requires iCloud Keychain enabled** — feature-detect and fall
  back silently.
- PRF does not work with roaming authenticators (YubiKey, QR flows) on iOS.
- Data encrypted with a PRF-derived key is bound to that passkey; losing the
  passkey locks that copy permanently. Biometric can therefore never be the only
  path in.
- Many in-app browsers and webviews block WebAuthn entirely, with no clear
  error.

### Storage durability

- `navigator.storage.persist()` is called during init. Prevents automatic
  eviction under disk pressure; does not prevent deliberate user deletion.
- **Safari deletes script-writable storage, IndexedDB included, after 7 days of
  no visits** — sites installed to the home screen are exempt. This is a primary
  justification for the PWA-only gate.

### PWA-only gate

The app refuses to run outside an installed PWA. First screen states
"Only PWA allowed" with install instructions.

- Any installed PWA qualifies, desktop or mobile. Mobile is the design target;
  desktop is permitted for demo purposes.
- Android Chrome exposes `beforeinstallprompt` — real install button.
- iOS Safari has no install API; the user must use Share → Add to Home Screen.
  Per-platform instruction screens required.
- **Recruiters and demo users must install too.** Deliberate: the PWA install is
  itself part of what the portfolio piece demonstrates. Accepted cost: friction
  for casual visitors, and it breaks inside social-app in-app browsers.

### What the server never receives

The PIN. The PIN-derived key. The Vault Key in plaintext. The Recovery Key. Any
private key. The device wrapping key.

The server holds: account data, device **public** keys in plaintext, one
recovery-wrapped Vault Key blob it cannot open, and encrypted vault records.
