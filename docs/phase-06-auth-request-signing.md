# Phase 6 — Authentication & Request Signing

**Goal:** the client authenticates with an account password once, registers its
device, and thereafter signs every request. No sessions, no tokens.

**Depends on:** Phases 3 and 5.

**Produces:** a device that can make authenticated calls the server verifies by
signature.

---

## The model

There is **no session**. Every authenticated request carries a signature made
with the device private key, verified server-side against the registered public
key. Nothing expires, so an offline device never degrades.

Login with email and password happens **once per device**, to register it. After
that the password is never used again on that device.

---

## Login and registration

```
POST /auth/login
  { email, password, deviceId, publicKeyJwk, deviceName }
  → { userId, vaultKeyBlob | null }
```

One call does both: verifies the password, registers the device public key,
returns the recovery-wrapped vault key blob if one exists.

`vaultKeyBlob: null` means this account has no vault yet — the client runs
first-time setup (Phase 7). Non-null means recovery (Phase 7).

Rate-limit this endpoint. Unlike the PIN, this *is* a real server-side control
with a real attacker on the other side.

---

## Signed requests

Every other endpoint requires:

```
X-Device-Id:  <ULID>
X-Timestamp:  <ISO 8601 UTC>
X-Nonce:      <random, base64>
X-Signature:  <base64 ECDSA P-256 / SHA-256>
```

Signed message:

```
canonicalJson({ method, path, timestamp, nonce, body })
```

### Canonicalisation

Both sides must produce byte-identical input. Sort object keys recursively, no
whitespace, UTF-8. One byte of difference and every request fails with a
signature error that looks like a key problem but isn't.

Write it once on each side and test them against the same fixtures.

### Replay protection

A signature alone does not stop someone resending a captured request. Two
checks, both required:

1. **Timestamp window** — reject anything outside ±60 seconds of server time.
   Bounds how long a captured request stays useful.
2. **Nonce cache** — store seen nonces for the window duration and reject
   repeats. Without this, a request can be replayed freely inside its window.

The nonce cache can be a Postgres table with a TTL cleanup, or Redis if you have
one. At your scale a table with an index on `(nonce, seen_at)` and a periodic
delete is enough.

Clock skew is real. An offline phone can drift. 60 seconds is the compromise;
return a distinguishable error so the client can tell the user their clock is
wrong rather than showing "authentication failed".

---

## Server verification

```python
# app/security/signature.py
async def verify_signature(request: Request) -> User: ...
```

Steps, in order:

1. Read headers; reject if any are missing
2. Timestamp inside the window, or reject
3. Nonce unseen, or reject — then record it
4. Look up the device by `X-Device-Id`
5. Import its JWK public key
6. Rebuild the canonical message from the actual method, path and body
7. Verify; reject on failure
8. Return the owning user

Use it as a FastAPI dependency so no route can forget it.

```python
@router.post("/sync/notes/pull")
async def pull(user: User = Depends(verify_signature)): ...
```

### Never trust a client-supplied user id

The user comes from the device record found via the verified signature, never
from the request body. Otherwise anyone signs a request with someone else's user
id and reads their vault.

This is the single most important line in the backend.

---

## Client side

```ts
// src/services/api.client.ts
export const api: AxiosInstance;
```

An axios interceptor attaches the headers and signature to every request. Doing
it manually per call means one call eventually forgets.

The base URL comes from a `VITE_` env var. Remember anything `VITE_`-prefixed is
baked into the bundle and readable by anyone — fine for a URL, never for a
secret.

---

## Error handling

| Case | Behaviour |
| --- | --- |
| signature invalid | 401, client shows re-registration needed |
| timestamp outside window | 401 with a distinct code → "check your clock" |
| nonce replayed | 401, log it, this is an attack signal |
| device unknown | 401, client must log in again |
| offline | not an error — no request was attempted |

Offline is never an auth failure. Do not let a network error surface as "session
expired", because there is no session.

---

## Tests

Client:
- interceptor attaches all four headers
- `canonicalJson` is stable across key orderings

Server:
- valid signature passes
- tampered body fails
- timestamp outside window fails
- replayed nonce fails
- signature from device A with device B's id fails
- **a signed request for user A cannot read user B's data** — write this one first

Shared: a fixture of payload → canonical string, asserted in both suites. It
catches divergence before it costs you an evening.

---

## Done when

1. Login registers a device and returns its blob status.
2. A signed request succeeds; the same request replayed fails.
3. Editing one byte of the body fails verification.
4. The cross-user test fails to leak anything.
5. No endpoint except login is reachable without a signature.
