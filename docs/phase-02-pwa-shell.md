# Phase 2 — PWA Shell

**Goal:** the app is installable, refuses to run outside an installed PWA, and
has every non-content screen state built.

**Depends on:** Phase 1.

**Produces:** an installable app that shows the gate when opened in a browser
tab, and a splash when opened as an installed PWA.

---

## Why the gate exists

Safari deletes script-writable storage, IndexedDB included, after 7 days of no
visits. Sites installed to the home screen are exempt. Since the vault lives in
IndexedDB, an uninstalled Safari user loses everything after a week away.

This is a data-loss prevention measure, not a stylistic choice.

---

## 1. Service worker

```bash
npm i -D vite-plugin-pwa
```

```ts
// vite.config.ts
VitePWA({
  registerType: "prompt",
  manifest: {
    name: "PiDRIVE Vault",
    short_name: "PiDRIVE",
    display: "standalone",
    background_color: "#0e0f11",
    theme_color: "#0e0f11",
    icons: [/* 192, 512, maskable */],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,woff2}"],
  },
})
```

`registerType: "prompt"` rather than `autoUpdate`: a silent swap of app code
while a vault is unlocked is not something to do behind the user's back. Show an
update prompt.

**Precache the app shell only.** Never cache API responses — they are encrypted
blobs whose freshness matters, and RxDB already owns that concern.

---

## 2. Install detection

```ts
// src/lib/pwa.ts
export function isInstalled(): boolean;
export function isIos(): boolean;
export function isInAppBrowser(): boolean;
```

Detection notes:

- Installed: `window.matchMedia("(display-mode: standalone)").matches`, plus
  `navigator.standalone === true` for iOS Safari, which predates the standard.
- iOS has **no** `beforeinstallprompt`. The user must use Share → Add to Home
  Screen. There is no API to trigger it.
- In-app browsers (LinkedIn, WhatsApp, Instagram) block both installation and
  WebAuthn, often silently. Detect via user-agent substrings and show a
  dedicated "open in your browser" message rather than a generic failure.

---

## 3. `PwaGate`

First thing rendered. Nothing else initialises until it passes.

```tsx
// src/app/providers/pwa-gate.tsx
export function PwaGate({ children }: PropsWithChildren): ReactNode;
```

Branches:

| Condition | Screen |
| --- | --- |
| installed | render children |
| Android, installable | "Install PiDRIVE" + button wired to `beforeinstallprompt` |
| iOS Safari | Share → Add to Home Screen, illustrated |
| in-app browser | "Open in Safari/Chrome to continue" |
| desktop browser | install instructions for that browser |

Capture `beforeinstallprompt` in a `useEffect` and `preventDefault()` it, or the
browser shows its own banner and you lose control of the moment.

---

## 4. Persistent storage

```ts
// src/lib/storage.ts
export async function requestPersistence(): Promise<boolean>;
```

Calls `navigator.storage.persist()`. Do it once, immediately after the gate
passes. It asks the browser not to evict your data under disk pressure. It can
be refused, and refusal is not fatal — log it, carry on.

`navigator.storage.estimate()` is worth exposing too; the media phase will want
it.

---

## 5. State screens

Build all of these now as pure presentational components. Later phases only
compose them.

```
src/screens/states/
├── splash.tsx        brand mark, shown while bootstrapping
├── loading.tsx       spinner + message, for known-slow operations
├── empty.tsx         icon, message, optional action
├── error.tsx         recoverable — message + retry
└── fatal.tsx         unrecoverable — e.g. IndexedDB unavailable
```

Every one takes props and holds no state. A screen that fetches is a screen you
cannot reuse.

**Fatal is not hypothetical.** IndexedDB genuinely does not exist in Firefox
private browsing and under some Safari configurations. For an offline-first
vault that is unrecoverable, and it needs a real message rather than a white
page.

---

## 6. ErrorBoundary

```tsx
// src/app/providers/error-boundary.tsx
export class ErrorBoundary extends Component<Props, State>;
```

Must be a class — React has no hook equivalent for `componentDidCatch`.

Renders `fatal.tsx` on catch. **Do not log the error object anywhere it could
include decrypted data.** A thrown error from a service can carry a record in
its context.

---

## 7. Provider composition

```tsx
// src/app/app.tsx
<ErrorBoundary>
  <PwaGate>
    {/* TrustProvider arrives in Phase 8 */}
    {/* VaultProvider arrives in Phase 9 */}
    <Splash />
  </PwaGate>
</ErrorBoundary>
```

---

## Tests

- `isInstalled()` under each display-mode and `navigator.standalone` combination
- `PwaGate` renders the right branch for: installed, Android installable, iOS,
  in-app browser
- `ErrorBoundary` catches a throwing child and renders fatal
- state screens render their props

Mock `matchMedia` in setup — jsdom does not implement it.

---

## Done when

1. Built and served over HTTPS (or localhost), the browser offers to install.
2. Opened as a normal tab, the gate blocks with correct per-platform copy.
3. Opened from the home screen, the gate passes and the splash renders.
4. `navigator.storage.persisted()` returns true after first run on Chrome.
5. Airplane mode + installed app still loads the shell.
