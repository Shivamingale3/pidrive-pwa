# Phase 4 — Crypto Core

**Goal:** every cryptographic primitive the vault needs, tested in isolation, with
no UI attached.

**Depends on:** Phase 3.

**Produces:** a crypto module that can create a Vault Key, wrap it three
different ways, and unwrap it again.

---

## Module layout

```
src/services/crypto/
├── kdf.ts          PBKDF2 derivation
├── aes.ts          AES-GCM encrypt / decrypt
├── wrap.ts         wrap / unwrap the Vault Key
├── random.ts       random bytes, recovery key generation
└── encoding.ts     base64 ↔ ArrayBuffer, Crockford Base32
```

Small files with one job each. Crypto code is read far more often than written.

---

## Encoding

```ts
export function toBase64(buf: ArrayBuffer): string;
export function fromBase64(s: string): ArrayBuffer;
export function toCrockford(bytes: Uint8Array): string;
export function fromCrockford(s: string): Uint8Array;
```

Crockford Base32 excludes I, L, O and U to avoid lookalike confusion when a
human reads a recovery key off paper. Decoding must be forgiving: accept
lowercase, ignore dashes, map `0`/`O` and `1`/`I`/`L` to their canonical forms.

---

## Random

```ts
export function randomBytes(length: number): Uint8Array;
export function generateRecoveryKey(): string;   // XXXX-XXXX-XXXX-XXXX
```

Always `crypto.getRandomValues()`. Never `Math.random()` — it is not
cryptographically secure and an attacker who knows the seed knows your key.

16 Crockford characters at 5 bits each is 80 bits. Not brute-forceable; below
the threshold where input can be treated as an already-strong key, which is why
it still goes through the slow KDF.

---

## KDF

```ts
export interface KdfParams { salt: Uint8Array; iterations: number; }

export async function deriveKey(
  secret: string,
  params: KdfParams,
  usage: "wrap" | "encrypt"
): Promise<CryptoKey>;

export function defaultKdfParams(): KdfParams;
```

```ts
const material = await crypto.subtle.importKey(
  "raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]
);

return crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
  material,
  { name: "AES-KW", length: 256 },
  false,                                   // derived key is non-extractable too
  ["wrapKey", "unwrapKey"]
);
```

**Salt and iteration count are stored in plaintext beside the blob.** They must
be — the app needs them to reproduce the key. They were never secrets. They are
a speed limit, not a lock.

Iterations: at least 600,000 for SHA-256. Store the number you used rather than
hardcoding it at the read site, so it can be raised later without breaking
existing vaults.

**Argon2id is not used.** It is stronger against GPU attacks but needs a WASM
dependency on the most security-critical path, against the minimal-dependency
stance. Deferred to hardening.

---

## AES-GCM

```ts
export interface Sealed { ciphertext: string; iv: string; }

export async function seal(key: CryptoKey, plaintext: string): Promise<Sealed>;
export async function open(key: CryptoKey, sealed: Sealed): Promise<string>;
```

**A fresh random 12-byte IV per encryption, always.** Reusing an IV with the same
key under GCM is catastrophic — it can leak the key. Generate inside `seal()` and
never let a caller pass one in.

GCM authenticates as well as encrypts, so `open()` throws on a wrong key or
tampered ciphertext rather than returning garbage. That property is what makes
PIN verification work without storing a hash.

---

## Wrapping the Vault Key

```ts
export async function createVaultKey(): Promise<CryptoKey>;

export async function wrapWithPin(
  vaultKey: CryptoKey, pin: string, deviceKey: CryptoKey
): Promise<{ blob: string; kdf: KdfParams }>;

export async function unwrapWithPin(
  blob: string, pin: string, kdf: KdfParams, deviceKey: CryptoKey
): Promise<CryptoKey>;

export async function wrapWithRecovery(
  vaultKey: CryptoKey, recoveryKey: string
): Promise<{ blob: string; kdf: KdfParams }>;

export async function unwrapWithRecovery(
  blob: string, recoveryKey: string, kdf: KdfParams
): Promise<CryptoKey>;
```

The Vault Key is AES-256-GCM, `extractable: true` — it must be, since wrapping
requires export. It exists in memory only while unlocked.

### Wrap order — fixed, never reverse it

```
vault key
   ↓ wrap with PIN-derived key      (inner — guessable secret)
   ↓ wrap with device wrapping key  (outer — unguessable secret)
stored blob
```

Unwrap is the reverse: device key first, then PIN.

**Why this order.** AES fails loudly on a wrong key, so a correct guess announces
itself. With the PIN layer outermost, an attacker holding a stolen database could
brute-force the PIN and *know* when they hit it. They still could not open the
vault, but they would have learned a PIN the user probably reuses. With the
device layer outermost, every attempt fails identically and the PIN never leaks.

### Why the device layer exists at all

A 6-digit PIN is 1,000,000 possibilities. At ~0.3s per PBKDF2 attempt that is a
few hours on a consumer GPU. "Not stored" does not mean "not obtainable" — the
PIN key is fully reconstructible from a guess, and the salt and iterations are
right there in the dump.

The device wrapping key is random, non-extractable, and never written as bytes.
A stolen database therefore contains a blob whose outer layer cannot be attacked
at all. The brute-force loop never runs.

**The recovery copy is single-wrapped — no device layer.** It must open on a
fresh device that has no device key. That is its entire purpose, and it is why
the recovery key is 80 bits rather than 6 digits.

---

## Three copies

| Copy | Wrapped by | Stored |
| --- | --- | --- |
| Biometric | WebAuthn PRF key (Phase 8) | client |
| PIN | PIN key, then device key | client |
| Recovery | recovery-key-derived key | server |

Same Vault Key in three boxes. Any one opens it; opening one reveals nothing
about the others.

---

## Rules

- No key material in logs. Not in error messages either.
- Never accept an IV from a caller.
- Never store a derived key — derive on demand.
- Every function takes `CryptoKey`, not raw bytes, wherever possible. Bytes in a
  signature invite someone to store them.

---

## Tests

This phase is where tests earn their keep.

- seal → open round-trips; `open` with the wrong key throws
- two `seal()` calls on identical plaintext produce different ciphertext
- wrap with PIN → unwrap with the same PIN returns a working key
- wrap with PIN → unwrap with a wrong PIN throws
- unwrap with the right PIN but a different device key throws
- recovery wrap/unwrap round-trips
- a Vault Key unwrapped via recovery decrypts data encrypted by the original
- `generateRecoveryKey()` produces 16 valid characters, never an excluded letter
- Crockford decode accepts lowercase, dashes, and `O`/`0` confusion

Last one is the real proof: encrypt with the original key, recover through a
completely separate path, decrypt successfully. If that passes, recovery works.

---

## Done when

1. All round-trip tests pass.
2. Every wrong-key path throws rather than returning garbage.
3. No `console.log` anywhere in `services/crypto/`.
4. Nothing in this module imports React, RxDB, or anything from `screens/`.
