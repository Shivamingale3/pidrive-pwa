# Phase 9 — Vault Database

**Goal:** RxDB opens after unlock, with schemas, repositories, and a service
factory that cannot produce a service without a Vault Key.

**Depends on:** Phase 8.

**Produces:** `VaultProvider`, `AppDatabase`, and the persistence layer.

---

## Opens after unlock, not before

The vault database is opened by `VaultProvider` **after** the Vault Key exists.
Before that it would be useless — every record in it is ciphertext.

There is no `DatabaseProvider`. The trust store is plain IndexedDB and needs no
provider at all.

---

## Record shape

```ts
export interface VaultRecord {
  id: string;              // ULID
  createdAt: string;
  updatedAt: string;
  payload: Sealed;         // { ciphertext, iv } — everything secret
}
```

```ts
// src/database/schemas/note.schema.ts
export const noteSchema: RxJsonSchema<NoteDocType> = {
  title: "notes",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id:        { type: "string", maxLength: 26 },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time", maxLength: 30 },
    payload: {
      type: "object",
      properties: {
        ciphertext: { type: "string" },
        iv:         { type: "string" },
      },
      required: ["ciphertext", "iv"],
    },
  },
  required: ["id", "createdAt", "updatedAt", "payload"],
  indexes: ["updatedAt"],
};
```

Rules encoded here:

- **One blob per record.** All secret fields serialized to JSON, encrypted once.
  Adding a secret field never touches this schema, which is what makes the
  migration problem disappear.
- **No index on anything encrypted.** Ciphertext cannot be indexed. With a fresh
  IV per encryption, identical plaintext produces different ciphertext, so even
  equality matching is impossible — not slow, impossible.
- **Only `updatedAt` is indexed**, and it needs `maxLength` because RxDB requires
  it on indexed strings.
- **No `deletedAt`.** Deletion is permanent; `_deleted` handles it.

---

## Migrations

RxDB runs migrations at database open — **before unlock, when no Vault Key
exists**. A migration that needs to decrypt is therefore impossible.

The single-blob shape avoids this: schema changes can only ever involve plaintext
metadata. The payload's internal shape carries its own `v` field *inside* the
encrypted JSON, upgraded lazily on decrypt.

```ts
interface NotePayloadV1 { v: 1; title: string; content: string; }
```

---

## Validation

Always on, development and production. Without a validator wrapper RxDB does not
enforce the schema at runtime.

```ts
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";

storage: wrappedValidateAjvStorage({ storage: getRxStorageDexie() })
```

---

## Repositories

Persistence only. **Never touch keys, never encrypt, never decrypt.**

```ts
// src/repositories/note.repository.ts
export class NoteRepository {
  constructor(private readonly collection: RxCollection<NoteDocType>) {}

  findAll$(): Observable<VaultRecord[]>;
  findById(id: string): Promise<VaultRecord | null>;
  insert(record: VaultRecord): Promise<void>;
  update(id: string, record: VaultRecord): Promise<void>;
  remove(id: string): Promise<void>;   // sets _deleted
}
```

A repository receives its collection rather than reaching for the database. That
keeps the dependency pointing one way and makes it trivially testable.

---

## AppDatabase

```ts
// src/database/app-database.ts
export class AppDatabase {
  static async create(vaultKey: CryptoKey): Promise<AppDatabase>;
  createServices(vaultKey: CryptoKey): Services;
  destroy(): Promise<void>;
}
```

- The `RxDatabase` instance is **private**.
- Repositories are **private**.
- Only services are exposed.

A public `RxDatabase` would let any component call `db.database.notes.find()` and
bypass both the repository and encryption. Private is what prevents that.

`create()` is singleton-safe via a cached promise — React StrictMode
double-invokes effects in development, and two RxDB instances on one database
name is an error.

---

## VaultProvider

```tsx
export function VaultProvider({ vaultKey, children }: Props): ReactNode;
```

On mount with a key: open the database, call `createServices(vaultKey)`, put the
services in context.

On lock: drop them, call `destroy()`.

Dropping the services tears down their RxDB subscriptions and their decryption
caches in one step. No cleanup call to forget.

```ts
export function useNoteService(): NoteService;   // throws when locked
```

**A service cannot be constructed without a Vault Key.** That is the whole
design: "locked" is unrepresentable rather than handled, and the type system
carries the rule instead of your discipline.

---

## Tests

- schema rejects a document missing `payload`
- repository insert → `findAll$` emits it
- `remove` sets `_deleted` and excludes it from `findAll$`
- `findAll$` sorts by `updatedAt`
- `AppDatabase.create()` called twice returns the same instance
- `createServices` requires a key — no overload permits omitting it
- `useNoteService()` throws outside `VaultProvider`

Use `fake-indexeddb` with a fresh database name per test file.

---

## Done when

1. Unlocking opens the vault database; locking destroys it.
2. Nothing outside `database/` and `repositories/` imports RxDB — the lint rule
   from Phase 1 enforces it.
3. A raw `RxCollection` is unreachable from any component.
4. Schema validation rejects a malformed document at runtime.
5. Locking and unlocking twice does not leak a second RxDB instance.
