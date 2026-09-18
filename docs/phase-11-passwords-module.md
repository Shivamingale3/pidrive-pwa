# Phase 11 — Passwords Module

**Goal:** the second vertical slice — encrypted password entries, a generator,
and safe clipboard handling.

**Depends on:** Phase 10. Copy its structure.

**Produces:** the vault's primary feature.

---

## Record shape

```ts
// src/types/password.types.ts
export interface PasswordPayloadV1 {
  v: 1;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

export interface PasswordEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}
```

Five fields, all encrypted, all inside one blob. No TOTP, no tags, no custom
fields, no attachments in v1.

Optional fields are stored as empty strings rather than `undefined`. It keeps
the payload shape stable and avoids `exactOptionalPropertyTypes` arguments at
every call site.

---

## Separate collection

`passwords` is its own RxDB collection with its own schema, its own repository,
its own service. Identical shape to notes, different payload type.

Resist the urge to build one generic `VaultService<T>` after seeing the
duplication. Notes and passwords will diverge — password history, breach checks,
expiry — and a premature abstraction across two things that are about to differ
costs more than the duplication does.

---

## PasswordService

Same shape as `NoteService`: own cache, own `concatMap` pipe, own filtering.

Search matches `title`, `username` and `url`. **Never search the password
field** — an attacker watching over a shoulder should not be able to confirm a
password by typing it into a search box.

---

## Generator

```ts
// src/services/password-generator.ts
export interface GeneratorOptions {
  length: number;              // default 20
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;   // l, I, 1, O, 0
}

export function generatePassword(options: GeneratorOptions): string;
export function estimateStrength(password: string): 0 | 1 | 2 | 3 | 4;
```

**`crypto.getRandomValues()`, never `Math.random()`.**

Avoid modulo bias. `randomValue % alphabet.length` skews toward early characters
when the range does not divide evenly. Use rejection sampling — discard values
above the largest exact multiple and draw again.

Guarantee at least one character from each enabled set, then shuffle. Otherwise
"include symbols" occasionally produces a password with none, and the user hits
a site that rejects it.

Strength estimation can be a simple entropy calculation from alphabet size and
length. Do not pull in `zxcvbn` — it is large, and for generated passwords the
entropy is known exactly.

---

## Clipboard

```ts
export async function copyWithAutoClear(value: string, ms = 30_000): Promise<void>;
```

Copy, then clear after 30 seconds. Show a countdown so the user knows.

Honest limits, worth knowing rather than assuming:

- Clearing writes an empty string over the clipboard. If the user copied
  something else in between, you overwrite that instead. Check before clearing
  where the API allows.
- Android and iOS clipboard managers may keep history you cannot reach.
- Clipboard access requires a user gesture. Copy inside the click handler, not
  after an await chain that loses the gesture.

Not perfect. Better than leaving a password on the clipboard indefinitely.

---

## Reveal

Passwords render masked. Revealing needs a deliberate tap and should auto-hide
after a short interval. Use `font-mono` when revealed — distinguishing `l` from
`1` matters.

Never put a real password in an `<input type="text">` that browsers might offer
to save. Use `type="password"` with a toggle, and `autocomplete="off"` on every
field in this module — a browser password manager storing your vault's passwords
is a second, weaker copy you did not consent to.

---

## Screens

```
src/screens/passwords/
├── password-list.tsx
├── password-detail.tsx      masked fields, copy buttons, reveal
├── password-editor.tsx      generator inline
└── components/
    ├── password-card.tsx
    ├── generator-sheet.tsx  shadcn sheet
    ├── strength-meter.tsx
    └── copy-button.tsx      countdown after copy
```

`npx shadcn@latest add sheet` here.

Consider a favicon-style avatar derived from the URL's first letter — **generated
locally**. Do not fetch favicons from the site: that leaks to a third party
exactly which services the user has accounts with, from a page holding decrypted
vault data.

---

## Tests

- create → read back with every field intact
- `generatePassword` honours each option
- generated passwords include at least one character from each enabled set
- distribution across the alphabet is roughly uniform over many samples — catches
  modulo bias
- `excludeAmbiguous` removes exactly the intended characters
- search matches title, username and url, and **never** the password field
- clipboard clears after the timeout — fake timers

---

## Done when

1. Password entries create, edit and delete with all five fields.
2. The generator produces passwords matching the selected options.
3. Copy clears after 30 seconds with a visible countdown.
4. IndexedDB shows ciphertext only.
5. No password appears in the DOM unless explicitly revealed.
6. Nothing in this module makes an outbound network request.
