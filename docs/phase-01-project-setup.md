# Phase 1 — Project Setup

**Goal:** an empty but correctly wired React + TypeScript + Tailwind + shadcn
project with linting, path aliases, a testing harness, and the folder structure
every later phase will fill in.

**Depends on:** nothing. This is the first phase.

**Produces:** a running dev server showing a single styled test page, and a
passing test suite with one trivial test.

---

## 1. Scaffold

Fresh project. Do not reuse the existing spike folder.

```bash
npm create vite@latest pidrive-pwa -- --template react-ts
cd pidrive-pwa
npm install
```

### TypeScript version trap — read before continuing

The scaffold installs whatever `typescript` version is current. If that is
**TypeScript 7**, `npm install` will fail once `typescript-eslint` is added:

```
npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint
```

TypeScript 7 is the Go-native rewrite. Its programmatic API is not stable until
7.1, and `typescript-eslint` reads that API. The fix is Microsoft's sanctioned
side-by-side arrangement — real TS 7 for compiling, the TS 6 API for tooling:

```json
"devDependencies": {
  "@typescript/native": "npm:typescript@^7.0.2",
  "typescript": "npm:@typescript/typescript6@^6.0.2"
}
```

`tsc` then resolves to TypeScript 7; the `typescript` package name resolves to
the 6.0 API. Both work at once.

**Do not "clean this up" later.** Revisit only when TypeScript 7.1 ships.

Verify:

```bash
npx tsc --version    # 7.x
npx tsc6 --version   # 6.x
```

---

## 2. Dependencies

```bash
# styling
npm i tailwindcss @tailwindcss/vite
npm i -D @types/node

# local storage
npm i rxdb idb-keyval

# ids and validation
npm i ulid zod

# http
npm i axios

# icons and motion
npm i lucide-react motion

# rich text (used from the Notes phase onward)
npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-task-list @tiptap/extension-task-item
```

Note there is **no crypto package**. All cryptography uses the browser's
built-in `crypto.subtle`. A JavaScript library cannot provide non-extractable
keys, because that guarantee comes from the browser holding key material
outside JavaScript.

---

## 3. Path alias

shadcn requires `@/` before its CLI will run.

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Add the same `baseUrl` and `paths` inside the existing `compilerOptions` of
`tsconfig.app.json`, keeping everything Vite generated.

`vite.config.ts`:

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
```

---

## 4. Tailwind and design tokens

Tailwind v4 has no `tailwind.config.ts`. Theme configuration lives in CSS.

Replace `src/index.css`:

```css
@import "tailwindcss";

@font-face {
  /* Plus Jakarta Sans — self-host, do not use a CDN.
     Section 22 forbids third-party origins on a page holding decrypted data. */
}

@theme {
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --color-ink: #101010;
  --color-ink-surface: #0e0f11;
  --color-canvas: #e7e5e0;
  --color-surface: #ffffff;
  --color-surface-subtle: #f5f4f1;
  --color-border-subtle: #eceae5;
  --color-text-muted: #77746e;
  --color-text-faint: #a09d97;
  --color-icon-muted: #8d8a84;
  --color-on-ink: #fefefe;
  --color-error: #c23c1a;
  --color-error-bg: #fdeeea;
  --color-error-text: #8f2b12;

  --radius-input: 18px;
  --radius-card: 24px;
  --radius-pill: 30px;

  --shadow-primary: 0 10px 26px rgba(16, 16, 16, 0.18);
}

@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-6px); }
  75%      { transform: translateX(6px); }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Self-host the font.** The threat model forbids third-party origins on a page
that handles decrypted vault data. Download Plus Jakarta Sans into
`public/fonts/` and point `@font-face` at it.

**Keep the reduced-motion block.** It is in the source designs and is an
accessibility requirement, not a nicety.

---

## 5. shadcn

```bash
npx shadcn@latest init
```

Answer: base colour **Neutral**, CSS variables **yes**. The CLI detects
Tailwind v4 and skips the old config generation.

Do not add components yet. Add each one in the phase that first needs it —
`npx shadcn@latest add dialog` when the first dialog appears, not before.
Unused component source in the repo is dead code you now own.

---

## 6. Folder structure

Create these now, empty. Having the shape settled prevents ad-hoc placement
later.

```
src/
├── app/                 App shell, provider composition, routing
│   └── providers/       PwaGate, TrustProvider, VaultProvider, ErrorBoundary
├── components/
│   ├── ui/              shadcn components (CLI-managed, avoid editing)
│   └── common/          shared hand-written components
├── screens/             one folder per screen, colocated components
├── contexts/            React contexts only — no logic
├── hooks/               React-facing API (useNotes, useTrust, ...)
├── services/            crypto + domain services. THE ONLY LAYER THAT DECRYPTS
├── repositories/        persistence only — never touches keys
├── database/
│   └── schemas/         RxDB JSON schemas
├── trust/               idb-keyval trust store access
├── types/               shared domain types
├── validation/          Zod schemas
└── lib/                 utils (shadcn puts cn() here)
```

### The layering rule

```
screens / components
      ↓
    hooks
      ↓
   services        ← encryption and decryption live here, nowhere else
      ↓
 repositories      ← never touch keys
      ↓
     RxDB
```

Never skip a layer. Never import upward. A repository importing a hook is
always a mistake.

---

## 7. ESLint

Keep the generated flat config and add these rules. Each exists to enforce
something the architecture depends on:

```js
"no-restricted-imports": ["error", {
  patterns: [
    {
      group: ["**/repositories/*"],
      message: "Repositories are reached through services only.",
    },
    {
      group: ["rxdb", "rxdb/*"],
      message: "RxDB imports belong in database/ and repositories/ only.",
    },
  ],
}],
"no-restricted-globals": ["error", {
  name: "localStorage",
  message: "localStorage is forbidden. Use idb-keyval or RxDB.",
}],
```

Add per-directory overrides so `database/` and `repositories/` may import RxDB.

Rules beat memory. The `localStorage` ban in particular is one a tired
developer will otherwise break at 1am.

---

## 8. Testing harness

```bash
npm i -D vitest @vitest/coverage-v8 jsdom \
         @testing-library/react @testing-library/user-event \
         @testing-library/jest-dom fake-indexeddb
```

`vitest.config.ts`:

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

`src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

`fake-indexeddb` matters: jsdom has no IndexedDB, and from Phase 3 onward almost
everything touches it.

Scripts:

```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage"
```

### What to test, and what not to

Test behaviour that would be expensive to get wrong: crypto round-trips,
repository queries, conflict resolution, service encrypt/decrypt boundaries.

Do not test that React renders a heading. Do not chase a coverage number — it
measures lines executed, not correctness, and optimising for it produces tests
that assert nothing.

---

## 9. Principles for every later phase

**Dependencies point inward.** Services know about repositories; repositories
know nothing about services. If you need the reverse, the split is wrong.

**Make illegal states unrepresentable.** Prefer a type that cannot express the
bad case over a runtime check that catches it. This is why services are
constructed with a Vault Key rather than checking for one — a service without a
key cannot exist.

**One reason to change per module.** A repository changes when persistence
changes. A service changes when domain rules change. If one file changes for
both reasons, split it.

**Name by role, not by pattern.** `NoteRepository` is a role. `NoteManager`,
`NoteHelper` and `NoteUtils` are not.

**Errors are values at boundaries.** Let genuinely unexpected failures throw to
the ErrorBoundary. Expected failures — a wrong PIN, an offline sync — are
outcomes to return, not exceptions to throw.

**No secrets in logs, ever.** Not the Vault Key, not a decrypted record, not a
PIN. A `console.log` left in a service is a plaintext vault in devtools.

---

## Done when

1. `npm run dev` serves a page using a design token — e.g. text in
   `text-ink font-sans`, a pilled `h-[60px] rounded-[--radius-pill]` button.
2. `npm run build` completes with no type errors.
3. `npm run lint` passes, and importing a repository from a screen fails it.
4. `npm run test` passes with one trivial test.
5. `npx tsc --version` reports 7.x.
6. Plus Jakarta Sans renders from `public/fonts/`, with no network request to a
   font CDN in the Network tab.
