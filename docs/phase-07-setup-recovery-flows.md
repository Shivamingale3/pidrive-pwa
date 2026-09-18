# Phase 7 — Setup & Recovery Flows

**Goal:** a new account can create a vault, and a new device can recover one.

**Depends on:** Phases 4 and 6.

**Produces:** the two paths that put a Vault Key in memory for the first time on
any given device.

---

## Two entry paths

After login, `vaultKeyBlob` decides which:

```
null      → first-time setup   (this account has no vault yet)
non-null  → recovery           (vault exists, this device must be let in)
```

---

## First-time setup

```
Login
  ↓
Generate device key pair + device wrapping key       (Phase 3)
  ↓
Generate Vault Key                                    (Phase 4)
  ↓
Set PIN → derive → wrap Vault Key (PIN, then device) → trust store
  ↓
Generate Recovery Key → derive → wrap Vault Key → upload blob
  ↓
Display Recovery Key ONCE
  ↓
Confirm the user saved it
  ↓
Vault ready, Vault Key in memory
```

```ts
// src/services/setup.service.ts
export async function runFirstTimeSetup(pin: string): Promise<{
  vaultKey: CryptoKey;
  recoveryKey: string;
}>;
```

### Order matters

Upload the recovery blob **before** showing the recovery key. If the upload fails
after the user has written the key down, they hold a key that opens nothing.

The whole thing must be idempotent. A user who closes the app mid-setup should
resume cleanly, not end up with half a vault. Write a setup-state marker to the
trust store and check it on boot.

---

## Recovery key screens

**Reveal.** The code large in `font-mono`, grouped `XXXX-XXXX-XXXX-XXXX`, copy
and download buttons. Copy must say plainly that losing it means losing the
vault, and that it will be needed on every new device — this is routine, not
break-glass.

A checkbox gates the continue button. Friction is the point.

**Confirm.** Ask for one or two random groups back. Catches the user who clicked
through without saving.

Do not put the recovery key in the URL, in app state that survives navigation,
or anywhere that could be persisted. It exists in memory for the duration of
these two screens and then it is gone.

---

## Recovery flow

```
Login on new device → blob returned
  ↓
Generate device key pair + device wrapping key for THIS device
  ↓
User enters Recovery Key
  ↓
Derive → unwrap blob → Vault Key recovered
  ↓
Set a PIN for this device → wrap locally (PIN, then device)
  ↓
Vault database opens, records sync down
```

```ts
// src/services/recovery.service.ts
export async function recoverVault(
  recoveryKey: string,
  blob: VaultKeyBlob
): Promise<CryptoKey>;
```

Each device has its **own** PIN and its **own** device wrapping key. Nothing
device-specific is shared or transferred. The recovery key is the only thing
that crosses between devices, and it comes from the user's memory or paper, never
over the wire in usable form.

A wrong recovery key throws from `unwrap` — AES integrity checking again. Show
the shake animation and let them retry. No lockout here: this path is already
gated by account login, and 80 bits is not brute-forceable.

---

## Regenerating the recovery key

In settings. Generates a new key, re-wraps the Vault Key, uploads the new blob,
displays once.

The old blob is replaced, so the old key stops working. State that explicitly in
the UI — a user with two written-down keys and no idea which is live is worse off
than before.

---

## Account password vs Recovery Key

These are different things and the UI must not blur them:

| | Recovers | Held by |
| --- | --- | --- |
| Account password | access to the server | user, resettable via email OTP |
| Recovery Key | the vault itself | user only, never resettable |

An account password reset gets you back into the API. It does **not** get you
back into the vault — the server cannot help with that, by design. Say so on the
reset screen, or users will reset their password and expect their notes back.

---

## Screens

```
src/screens/setup/
├── set-pin.tsx
├── confirm-pin.tsx
├── recovery-reveal.tsx
├── recovery-confirm.tsx
└── setup-complete.tsx

src/screens/recovery/
├── enter-recovery-key.tsx     4 groups, auto-advance, paste-aware
├── recovering.tsx
└── recovery-failed.tsx
```

Paste handling on the recovery input is worth getting right: accept the whole
code pasted into the first box and distribute it across the four.

---

## Tests

- setup produces a Vault Key recoverable by both the PIN and the recovery key
- the recovery key from setup unwraps the uploaded blob
- a wrong recovery key throws
- setup interrupted before upload leaves no partial state
- regenerating invalidates the previous key
- recovery on a simulated fresh device — empty trust store — reaches a working
  Vault Key

The last one is the real test. Clear everything, run recovery, decrypt a record
encrypted before the wipe.

---

## Done when

1. A fresh account completes setup and shows a recovery key once.
2. Clearing site data and recovering with that key restores access.
3. Data encrypted before the wipe decrypts after recovery.
4. A wrong recovery key fails cleanly.
5. Nothing logs the recovery key or the Vault Key.
