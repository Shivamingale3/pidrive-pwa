# Phase 8 — Unlock: PIN, Biometric, TrustProvider

**Goal:** a set-up device can unlock daily — biometric first, PIN as fallback —
and locks when hidden.

**Depends on:** Phase 7.

**Produces:** `TrustProvider`, which holds the Vault Key and hands it down.

---

## PIN unlock

```ts
// src/services/unlock.service.ts
export async function unlockWithPin(pin: string): Promise<CryptoKey>;
```

Read the blob, salt and iterations from the trust store; read the device
wrapping key; unwrap outer then inner.

**Nothing is compared.** There is no stored PIN, no hash, no check. A wrong PIN
produces a failed unwrap, and the failure *is* the verification. If you find
yourself writing `if (pin === stored)`, stop — that code path can be edited out
by an attacker, and cryptography cannot.

---

## Biometric unlock (WebAuthn PRF)

PRF — pseudo-random function — is a WebAuthn extension that derives a stable
secret from a passkey. Same passkey plus same salt always gives the same bytes,
and they never leave the authenticator's control.

```ts
// src/services/biometric.service.ts
export async function isBiometricAvailable(): Promise<boolean>;
export async function enrolBiometric(vaultKey: CryptoKey): Promise<void>;
export async function unlockWithBiometric(): Promise<CryptoKey>;
```

Enrolment creates a passkey with PRF requested:

```ts
await navigator.credentials.create({
  publicKey: {
    /* rp, user, challenge, pubKeyCredParams */
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required",
    },
    extensions: { prf: {} },
  },
});
```

Unlock asserts with a fixed salt and derives a key from the PRF output:

```ts
const assertion = await navigator.credentials.get({
  publicKey: {
    challenge,
    extensions: { prf: { eval: { first: PRF_SALT } } },
  },
});
const prf = assertion.getClientExtensionResults().prf?.results?.first;
```

Import those bytes as an AES key and unwrap the biometric copy of the Vault Key.

### Platform reality — feature-detect, never assume

- Android has the broadest PRF support; Google Password Manager passkeys include
  it by default.
- Apple supports it for iCloud Keychain platform passkeys via Face ID / Touch ID
  in Safari 18+, **but only if iCloud Keychain is enabled**. Off, and PRF is
  silently unavailable.
- PRF is not available for roaming authenticators on iOS. Irrelevant here.
- Many in-app browsers block WebAuthn entirely with no clear error.

So: check `prf.enabled` after creation, and if it is not there, skip enrolment
and keep PIN as the only path. Never leave the user with no way in.

**There is no biometric screen to design.** The OS renders its own prompt and it
cannot be overridden. Your UI is the PIN screen with a biometric re-trigger
button for when the prompt is dismissed or fails.

### Losing the passkey

Data tied to a PRF-derived key is locked permanently if the passkey is lost.
That is why biometric can never be the only path, and why the PIN and recovery
copies exist.

---

## TrustProvider

```tsx
// src/app/providers/trust-provider.tsx
export function TrustProvider({ children }: PropsWithChildren): ReactNode;
```

Owns: account session state, device identity, PIN and biometric verification,
unwrapping the Vault Key. Hands the raw Vault Key down to `VaultProvider`.

```ts
export interface TrustContextValue {
  status: "checking" | "needs-login" | "needs-setup" | "locked" | "unlocked";
  vaultKey: CryptoKey | null;
  unlock(pin: string): Promise<void>;
  unlockBiometric(): Promise<void>;
  lock(): void;
  changePin(current: string, next: string): Promise<void>;
}
```

A discriminated status rather than a handful of booleans. `isLoading && !isReady
&& hasKey` is a state machine nobody wrote down, and it will eventually reach a
combination you never considered.

`lock()` drops the key reference. There is no way to zero a `CryptoKey` in
JavaScript — dropping the reference and letting GC take it is the best available.
Do not hold it anywhere else.

---

## Auto-lock

**Trigger: page hidden. No timer of any kind.**

```ts
document.addEventListener("visibilitychange", () => {
  if (document.hidden) lock();
});
```

On mobile this is partly reinforced for free — backgrounding a PWA often gets
the tab discarded, wiping memory anyway.

Lock discards unsaved form state. Preserving it would mean plaintext vault data
surviving the lock, which defeats the point. Warn on a dirty form if you like,
but do not keep the content.

Known gap, deliberately accepted: an app left open and untouched stays unlocked.
On a phone the screen sleeps and the PWA hides. On desktop it does not. Revisit
after v1.

---

## PIN lockout

Escalating cooldowns after failed attempts: 30s → 5m → 1h.

**Be honest about what this is.** It deters someone holding a stolen or borrowed
phone. It is *not* protection against a database dump — an attacker with the
data never runs your app, so your counter is irrelevant to them. That attack is
blocked by the device wrapping key, not by this.

Store the attempt count and cooldown expiry in the trust store so a reload does
not reset them. Do not word the UI as though the wait protects the vault.

---

## Screens

```
src/screens/unlock/
├── pin-entry.tsx      6 boxes, mono, shake on error, biometric retry button
├── locked-out.tsx     countdown, mono digits
└── unlocking.tsx
```

---

## Tests

- correct PIN unlocks; wrong PIN throws
- wrong PIN increments the counter and persists across reload
- cooldown blocks attempts until expiry
- `visibilitychange` to hidden clears the key
- biometric unavailable falls back to PIN without error
- `TrustContextValue.vaultKey` is null in every state except `unlocked`

Mock `navigator.credentials` — jsdom has no WebAuthn.

---

## Done when

1. Reopening the app asks for biometric, falling back to PIN.
2. A wrong PIN shakes and counts; enough failures trigger a cooldown that
   survives reload.
3. Backgrounding the app locks it.
4. A device with biometric unavailable still unlocks by PIN.
5. `vaultKey` is unreachable from anywhere except `TrustProvider`.
