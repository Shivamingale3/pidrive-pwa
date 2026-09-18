# Phase 15 — Polish, Hardening & Deploy

**Goal:** ship it, and close the security gaps deliberately deferred during
"build first, harden second".

**Depends on:** everything.

---

## Content Security Policy

The single most valuable hardening step, and the one the whole XSS argument rests
on.

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self' https://your-api-host;
frame-ancestors 'none';
base-uri 'self';
form-action 'none';
object-src 'none';
```

Notes:

- **No CDN anywhere.** Fonts self-hosted (Phase 1). A third-party script origin
  on a page holding decrypted vault data defeats the point of the CSP.
- `style-src 'unsafe-inline'` is needed for Tailwind and TipTap. Live with it —
  inline styles are far less dangerous than inline scripts.
- `connect-src` lists your API explicitly. This is what stops an injected script
  posting your vault somewhere.
- `frame-ancestors 'none'` blocks clickjacking.

Set it as a response header on the host, not only a meta tag — `frame-ancestors`
is ignored in meta.

Also: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
`Permissions-Policy` disabling camera, microphone and geolocation.

---

## Dependency minimisation

Audit before shipping:

```bash
npm ls --depth=0
npx depcheck
npm audit
```

Every runtime dependency is code that executes on a page holding decrypted vault
data. Remove anything unused. Pin exact versions for the crypto-adjacent path.

Consider `npm ci --ignore-scripts` in CI — install scripts are a real
supply-chain vector.

---

## What CSP does not fix

Be honest in the README. If hostile JavaScript executes inside your origin while
the vault is unlocked, it can use the live Vault Key regardless of
non-extractability — it does not need to *read* the key, only to *use* it.

CSP, no third-party scripts, minimal dependencies and lock-on-hide reduce blast
radius. They do not eliminate the class. Saying so is more credible than
claiming otherwise, and an interviewer will respect the distinction.

---

## Animation pass

Motion for transitions, `tailwindcss-animate` for shadcn's built-ins.

Where motion earns its place:

- unlock → vault: a transition that signals state change
- list items entering: staggered `rise`
- PIN error: `shake`
- sheets and dialogs: shadcn's defaults are fine
- sync loader: progress that visibly moves

**Keep the `prefers-reduced-motion` block from Phase 1 working.** Test it — it is
in the source designs and it is an accessibility requirement, not decoration.

Animation on a security app should feel quick and certain. Slow, bouncy motion
reads as unserious for something holding bank passwords.

---

## Accessibility

- Every interactive element reachable by keyboard
- Focus visible, and focus trapped inside dialogs
- PIN inputs labelled and announced
- `aria-live` on sync status and error banners
- Contrast checked — `#a09d97` on white is borderline for small text
- Icon-only buttons have `aria-label`

Copy buttons need an announcement. A blind user gets no feedback that a password
was copied otherwise.

---

## Error and empty states

Walk every screen and confirm all four states exist: loading, empty, error, and
content. Empty states should offer the action, not just report emptiness.

Error messages must be specific enough to act on. "Something went wrong" is not
an error message. "Couldn't reach your server. Your vault still works offline."
is.

---

## Performance

- Route-level code splitting with `React.lazy`
- TipTap is large — load it only on the note editor route
- Check bundle size with `rollup-plugin-visualizer`
- Test the list with 500 records: first decrypt is slow, subsequent renders
  should hit the cache
- Verify editing one record does not re-decrypt the others

---

## Deploy

**Client.** Any static host. Must be HTTPS — WebAuthn, service workers and
`crypto.subtle` all require a secure context. Configure the security headers
above.

**Server.** Your Pi. Docker Compose with FastAPI plus Postgres, behind Caddy or
nginx for TLS.

Backups: Postgres holds encrypted records and wrapped key blobs. Back it up —
losing it means every device that clears storage loses its vault. The backup is
safe to store anywhere, since the server has nothing that can decrypt it.

---

## Final security review

Walk the list and verify each by inspection, not memory:

- [ ] No `console.log` in `services/`, `trust/`, or any crypto path
- [ ] No secret in a `VITE_` variable
- [ ] `localStorage` unused — lint rule green
- [ ] Device private key non-extractable, `exportKey` throws
- [ ] No PIN stored in any form
- [ ] Recovery key never sent to the server
- [ ] Vault Key sent only recovery-wrapped
- [ ] Server has no column that could hold a key or PIN
- [ ] Every endpoint except login requires a signature
- [ ] Cross-user access tested and impossible
- [ ] Tombstones carry no payload
- [ ] IndexedDB inspection shows ciphertext only
- [ ] Lock clears the key and the decryption cache
- [ ] CSP blocks an injected inline script — test it

---

## README

For a portfolio piece the README does as much work as the code. Cover:

- what it is, in two sentences
- the threat model, and what it explicitly does not defend against
- the key architecture diagram — three wrapped copies, why each exists
- why the device wrapping key exists (the 6-digit PIN maths)
- why sync is push/pull with checkpoints rather than a REST CRUD API
- why the server cannot decrypt anything
- the known limitations, stated plainly

The limitations section is the part that signals engineering maturity. Anyone can
list features.

---

## Done when

1. Deployed over HTTPS, installable on Android and iOS.
2. CSP active; an injected inline script is blocked.
3. Lighthouse PWA and accessibility both pass.
4. Two devices sync, converge, and survive offline edits.
5. Full recovery works from a wiped device.
6. Every box in the security review is ticked.
7. The README explains the design to someone who has not read these phases.
