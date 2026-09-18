# Phase 10 — Notes Module

**Goal:** the first complete vertical slice — encrypted rich-text notes with
CRUD, live list, and search.

**Depends on:** Phase 9.

**Produces:** a working feature, and the pattern every later module copies.

---

## Types

```ts
// src/types/note.types.ts
export interface NotePayloadV1 {
  v: 1;
  title: string;
  content: string;      // TipTap HTML
}

export interface Note {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  content: string;
}

export type CreateNote = Pick<Note, "title" | "content">;
export type UpdateNote = Partial<CreateNote>;
```

`Note` is the decrypted domain object. `VaultRecord` is what is stored. Only the
service knows both — that boundary is the point of the whole architecture.

---

## NoteService

The **only** layer that decrypts.

```ts
// src/services/note.service.ts
export class NoteService {
  constructor(
    private readonly repository: NoteRepository,
    private readonly vaultKey: CryptoKey
  ) {}

  findAll$(search?: string): Observable<Note[]>;
  getById(id: string): Promise<Note | null>;
  create(input: CreateNote): Promise<string>;
  update(id: string, input: UpdateNote): Promise<void>;
  remove(id: string): Promise<void>;
}
```

### Decryption cache

```ts
private cache = new Map<string, Note>();   // key: `${id}:${updatedAt}`
```

A changed record gets a new `updatedAt`, so its key changes, the old entry
becomes unreachable, and only the changed record is re-decrypted.

Without this, every emission of the RxDB stream re-decrypts every record —
because any single write re-emits the whole list.

Unbounded, no eviction. Its lifetime is the service's lifetime: `VaultProvider`
drops the service on lock and the cache dies with it. **There is no clear-cache
call that can be forgotten.** That is why it lives here and not in React.

### The reactive pipe

```ts
findAll$(search?: string): Observable<Note[]> {
  return this.repository.findAll$().pipe(
    concatMap(records => this.decryptAll(records)),
    map(notes => (search ? filterNotes(notes, search) : notes))
  );
}
```

`concatMap`, not `map` — decryption is async and emission order must be
preserved. `mergeMap` would let a fast small emission overtake a slow large one
and render stale data.

Filtering happens here because this is where the decrypted records and the cache
live. Handing plaintext upward just to filter it would spread vault data across
layers for no reason.

### Write path

```ts
async create(input: CreateNote): Promise<string> {
  const payload: NotePayloadV1 = { v: 1, ...input };
  const sealed = await seal(this.vaultKey, JSON.stringify(payload));
  const now = new Date().toISOString();
  const id = ulid();
  await this.repository.insert({ id, createdAt: now, updatedAt: now, payload: sealed });
  return id;
}
```

ULIDs are lexicographically sortable by creation time, which is a useful
property for free.

---

## useNotes

```ts
// src/hooks/useNotes.ts
export function useNotes(options?: { search?: string }): {
  data: Note[];
  loading: boolean;
  error: Error | null;
  getById(id: string): Promise<Note | null>;
  create(input: CreateNote): Promise<string>;
  update(id: string, input: UpdateNote): Promise<void>;
  remove(id: string): Promise<void>;
};
```

One hook per domain. No `useCreateNote` / `useUpdateNote` split — that
multiplies into a hook per operation per domain for nothing.

`loading` is **initial load only**: true before the first emission, false after.
Mutations do not toggle it; the stream re-emits when a write lands, which is the
whole benefit of the reactive layer.

Subscribe in `useEffect`, unsubscribe in cleanup. A leaked subscription on a
decrypting stream keeps plaintext alive after the component is gone.

---

## Search

In-memory, over decrypted records. No debounce — with the cache warm it is an
array filter.

Search both title and content, but strip HTML from content before matching or
users will get hits on `<strong>`.

---

## Editor

TipTap with StarterKit plus TaskList and TaskItem for checkboxes.

```tsx
const editor = useEditor({
  extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
  content: note.content,
});
```

Two things to get right:

**Autosave with a debounce.** ~800ms after typing stops. Every save is an
encrypt plus a write, so saving per keystroke is wasteful. Flush the pending
save on unmount and on navigation.

**Lock discards unsaved state** (Phase 8). With autosave the window is small, but
it is not zero. That is accepted, not solved.

TipTap stores HTML. Sanitise on the way out if content ever renders outside the
editor — it is your own data, but a vault that renders HTML is a place where an
XSS payload would be very comfortable.

---

## Screens

```
src/screens/notes/
├── note-list.tsx       search field, cards, empty state
├── note-detail.tsx     read view
├── note-editor.tsx     TipTap, autosave indicator
└── components/
    ├── note-card.tsx
    └── delete-dialog.tsx
```

`npx shadcn@latest add dialog` here — the first real need for it.

Delete is permanent and confirm-only. No recycle bin. The dialog must say so
plainly: this cannot be undone.

---

## Tests

Service:
- create → `findAll$` emits the decrypted note
- update changes `updatedAt` and the decrypted content
- remove excludes it from the stream
- the cache does not re-decrypt an unchanged record — spy on `open`
- a service built with a different key cannot read the records
- search matches title and content, ignores HTML tags

Hook:
- `loading` true then false
- unmount unsubscribes

The cross-key test is the one that proves encryption is actually happening.

---

## Done when

1. Notes create, edit with rich text, and delete.
2. The list updates reactively with no manual refetch.
3. Search filters live.
4. Inspecting IndexedDB in devtools shows ciphertext only — no readable title,
   no readable content.
5. Editing one note does not re-decrypt the others.
6. Locking and unlocking re-renders the list correctly from a cold cache.
