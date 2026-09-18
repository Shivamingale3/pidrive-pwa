# Phase 14 — Settings & Account

**Goal:** everything the user manages about their own vault and devices.

**Depends on:** Phase 13.

**Produces:** the settings surface.

---

## Sections

```
src/screens/settings/
├── settings-home.tsx
├── security/
│   ├── change-pin.tsx
│   ├── biometric-toggle.tsx
│   └── regenerate-recovery-key.tsx
├── sync/
│   └── sync-settings.tsx      last synced, status, "Sync now"
├── devices/
│   └── device-list.tsx        registered devices, revoke
└── account/
    ├── change-password.tsx
    └── sign-out.tsx
```

---

## Change PIN

```ts
changePin(current: string, next: string): Promise<void>;
```

Unwrap with the current PIN, re-wrap with the new one. **Only the local blob
changes.** The server's recovery copy is wrapped by the recovery key and is
untouched — that is the point of separating them.

Generate a **fresh salt** for the new PIN. Reusing the old salt means the same
PIN produces the same derived key, which leaks whether the PIN actually changed.

Verification is the unwrap. A wrong current PIN throws; there is nothing to
compare against.

Do this as: unwrap → confirm → re-wrap → write → only then discard the old blob.
An interrupted change must never leave a vault with no valid wrapping.

---

## Biometric toggle

Enabling wraps the Vault Key with a PRF-derived key and stores a third copy.
Disabling deletes that copy — the PIN and recovery copies are unaffected.

Requires the vault to be unlocked, since it needs the Vault Key to wrap.

Feature-detect before showing the toggle. On a device without PRF, hide it rather
than showing a control that fails on tap.

---

## Regenerate recovery key

Generate a new key, re-wrap the Vault Key, upload the new blob, display once.

**The old key stops working immediately.** Say so explicitly, before and after.
A user holding two written-down keys with no idea which is live is worse off than
before they started.

Same ordering rule as setup: upload before display. A key the user has written
down that opens nothing is the worst possible outcome.

---

## Device list

```
GET  /devices        → [{ id, name, createdAt, lastSeenAt, isCurrent }]
POST /devices/{id}/revoke
```

Revoking deletes the device's public key. Its signed requests then fail, so it
can no longer sync.

Be honest in the UI about what revocation does and does not do. It cuts the
device off from the **server**. It does **not** wipe the vault already on that
device — that data is local, encrypted, and unlocks with that device's own PIN.
Revocation is not remote wipe. Claiming otherwise would be a lie with real
consequences.

The current device cannot revoke itself. Grey it out.

---

## Change account password

Standard: current password, new password, server-side. Requires network.

**Must state plainly that this does not affect the vault.** Users assume password
changes reprotect their data. Here the account password only guards the API; the
vault is guarded by the PIN and the recovery key. Without that sentence, someone
will change their password believing they have rotated their vault protection.

---

## Sign out

Clears the account session and locks the vault. Offer two levels:

1. **Sign out** — keeps the local vault, requires PIN on return
2. **Sign out and erase this device** — clears the trust store and vault
   database entirely

The second needs a hard confirmation naming the consequence: without the recovery
key, the vault is gone from this device permanently. Type-to-confirm is
appropriate.

---

## Sync settings

Last synced time, current status, "Sync now" button opening the blocking loader.

Show the manual button even when it seems redundant — it is the reassurance
mechanism when someone is switching devices and wants to be certain a push
landed.

---

## Principles

**Destructive actions confirm; everything else does not.** A confirmation dialog
on a harmless toggle trains people to dismiss dialogs without reading, which is
exactly what you cannot afford on the one that matters.

**Never claim more security than you provide.** Revocation is not remote wipe. A
PIN lockout does not protect against a database dump. An account password change
does not rotate vault encryption. Every one of these is tempting to overstate and
wrong to.

---

## Tests

- change PIN: old PIN stops working, new one works, recovery still works
- change PIN with wrong current throws and changes nothing
- change PIN generates a new salt
- regenerate recovery key: old key fails, new key works
- biometric toggle off removes only the biometric copy
- erase-device clears both stores
- the current device cannot be revoked

The "recovery still works after a PIN change" test is the one that catches a
whole class of mistakes.

---

## Done when

1. PIN change works and leaves recovery intact.
2. Regenerating a recovery key invalidates the old one.
3. Biometric toggles without affecting other unlock paths.
4. Devices list and revoke correctly.
5. Erase-device leaves a truly clean state, recoverable only via recovery key.
6. No settings screen overstates what it does.
