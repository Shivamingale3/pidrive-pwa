# Phase 3 — Trust Store & Device Keys

**Goal:** the device can generate and persist its identity, and sign data with
it. No vault yet, no PIN yet.

**Depends on:** Phase 2.

**Produces:** a device that generates a key pair once, reuses it across reloads,
and can sign a payload.

---

## The store

Plain IndexedDB via `idb-keyval`, in its own database, separate from the RxDB
vault database.

**Why not RxDB.** RxDB documents must be JSON. It validates against a schema and
hashes documents by serializing them. A `CryptoKey` has no serializable content
— `JSON.stringify(cryptoKey)` returns `{}`. Plain IndexedDB works because it uses
structured clone, which handles `CryptoKey` natively. This is a storage-layer
constraint, not a preference.

```ts
// src/trust/store.ts
import { createStore, get, set, del } from "idb-keyval";

const store = createStore("pidrive-trust", "trust");

export const TrustKeys = {
  devicePrivateKey: "device.private",
  deviceWrappingKey: "device.wrapping",
  vaultKeyPin: "vault.wrapped.pin",
  vaultKeyBiometric: "vault.wrapped.biometric",
  pinSalt: "pin.salt",
  pinIterations: "pin.iterations",
  deviceId: "device.id",
} as const;

export function trustGet<T>(key: string): Promise<T | undefined>;
export function trustSet(key: string, value: unknown): Promise<void>;
export function trustDel(key: string): Promise<void>;
export function trustClear(): Promise<void>;
```

Centralise the key names. Scattered string literals are how you end up writing
to `"device.privatekey"` and spending an evening on it.

---

## Device identity keys

```ts
// src/services/device-key.service.ts
export async function generateDeviceKeyPair(): Promise<CryptoKeyPair>;
export async function getDevicePrivateKey(): Promise<CryptoKey | undefined>;
export async function exportPublicKeyJwk(key: CryptoKey): Promise<JsonWebKey>;
export async function signPayload(payload: unknown): Promise<string>;
```

Generation:

```ts
const keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  false,                    // extractable: false — permanent, irreversible
  ["sign", "verify"]
);

await trustSet(TrustKeys.devicePrivateKey, keyPair.privateKey);  // the handle
const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
```

### What `extractable: false` means

`keyPair.privateKey` is **not bytes**. It is a handle — a reference to material
the browser holds internally. Log it and you get four metadata fields and
nothing else. `exportKey()` on it throws `InvalidAccessError`. There is no API,
anywhere, that returns those bytes.

Signing happens **inside** the browser. You pass the handle in and get a
signature out; the key never crosses back into JavaScript.

Mental model: a database connection object, not a database password.

The flag is set once at generation and cannot be changed later.

Store the handle directly:

```ts
await trustSet(TrustKeys.devicePrivateKey, keyPair.privateKey);  // ✅
```

No `JSON.stringify`, no base64. IndexedDB stores the object natively.

The public key is the opposite case — export it, send it, store it plaintext.
Wrapping a public key would break the only thing it is for.

---

## Signing

```ts
const signature = await crypto.subtle.sign(
  { name: "ECDSA", hash: "SHA-256" },
  privateKey,
  new TextEncoder().encode(canonicalJson(payload))
);
```

**Canonicalisation matters.** The server re-serializes the payload to verify. If
key order or whitespace differs by one byte, verification fails. Write a
`canonicalJson()` that sorts keys recursively and emits no whitespace, and use it
on both sides. The full request-signing contract lands in Phase 6.

---

## Device wrapping key

The second non-extractable key. Phase 4 uses it; generate it here.

```ts
const wrappingKey = await crypto.subtle.generateKey(
  { name: "AES-KW", length: 256 },
  false,
  ["wrapKey", "unwrapKey"]
);
```

A non-extractable key can still *perform* wrapping. It just cannot be exported
itself.

---

## Device ID

A ULID generated at setup, stored in the trust store, sent with registration.
Gives the server a stable handle for this device without it needing to
fingerprint anything.

---

## What is deliberately absent

- No backup of the private key. It cannot be exported, and should not be. A
  device identity that can be copied elsewhere is not a device identity.
- No expiry, no session. Losing the key means this device registers a fresh pair
  on next login.

---

## Tests

- generate → store → read back → sign → verify with the exported public key
- `exportKey()` on the private key rejects
- a second call to setup does not overwrite an existing key
- `trustClear()` empties the store
- `canonicalJson()` produces identical output for objects differing only in key
  order

`fake-indexeddb` covers storage. Node's Web Crypto satisfies `crypto.subtle` in
Vitest.

---

## Done when

1. First load generates a key pair; a reload reuses the same one.
2. A payload signed in the app verifies against the exported public key, checked
   in a test.
3. `exportKey()` on the private key throws.
4. Clearing site data and reloading produces a new, different key pair.
