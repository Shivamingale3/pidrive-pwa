# Phase 13 — Client Replication

**Goal:** RxDB replication wired to the FastAPI endpoints, with last-write-wins
conflict resolution and the blocking sync UI.

**Depends on:** Phase 12.

**Produces:** a vault that syncs.

---

## Replication handler

```ts
// src/services/replication.service.ts
import { replicateRxCollection } from "rxdb/plugins/replication";

export function startReplication(
  collection: RxCollection,
  name: "notes" | "passwords"
): RxReplicationState<VaultRecord, Checkpoint>;
```

```ts
replicateRxCollection({
  collection,
  replicationIdentifier: `pidrive-${name}`,
  live: false,                 // manual/triggered, not continuous
  retryTime: 5_000,
  push: {
    batchSize: 50,
    async handler(rows) {
      const { data } = await api.post(`/sync/${name}/push`, { rows });
      return data.conflicts;             // RxDB resolves these locally
    },
  },
  pull: {
    batchSize: 50,
    async handler(checkpoint, limit) {
      const { data } = await api.post(`/sync/${name}/pull`, { checkpoint, limit });
      return { documents: data.documents, checkpoint: data.checkpoint };
    },
  },
});
```

`live: false` because sync is triggered, not continuous — app open, after a
write, or the manual button.

**Pull runs before push.** RxDB does this by design: pushing without pulling
first means your `assumedMasterState` is stale and the server rejects everything,
costing a round trip to learn what you could have asked for.

The push handler **returns** conflicts rather than throwing. Returning means "you
handle these"; throwing means "the request failed" and triggers a retry of the
same doomed push.

---

## Conflict handler

```ts
const conflictHandler: RxConflictHandler<VaultRecord> = {
  isEqual: (a, b) => a.updatedAt === b.updatedAt,
  resolve: ({ realMasterState, newDocumentState }) =>
    newDocumentState.updatedAt > realMasterState.updatedAt
      ? newDocumentState
      : realMasterState,
};
```

Last write wins by `updatedAt`. No UI, no conflicts collection, no duplicate
copies. The loser is discarded silently.

Resolution is necessarily client-side — the server sees only ciphertext and
cannot compare content. "Server always wins" was never available.

Accepted consequence: an edit made on two devices while both were offline loses
one version with no warning. Auto-sync on app open keeps drift small enough that
this is rare.

Note the handler compares the **envelope**, not the payload. It never needs the
Vault Key, which is why it can be a plain object rather than a service.

---

## When sync runs

| Trigger | Blocking |
| --- | --- |
| App open, if online | **Yes** — full-screen loader |
| Manual button in settings | **Yes** — full-screen loader |
| After a local write, if online | No — silent background push |

**Offline means no sync, so the app opens normally.** The loader appears only
when sync actually runs. This preserves the guarantee that offline operation is
unlimited.

**Timeout: 60 seconds.** Past that, proceed offline with a sync-failed notice
rather than trapping the user behind a loader.

**Failure never blocks entry.** Server error, signature rejection, network drop —
show it, let them in. The vault is on their device and works.

---

## SyncProvider

```tsx
export interface SyncContextValue {
  status: "idle" | "syncing" | "synced" | "failed" | "offline";
  lastSyncedAt: string | null;
  progress: { pulled: number; pushed: number } | null;
  syncNow(): Promise<void>;
}
```

Lives inside `VaultProvider` — replication needs both the collections and the
Vault Key's lifetime. On lock, replication stops with everything else.

Track online state with `navigator.onLine` plus the `online`/`offline` events.
Note `navigator.onLine` only reports whether there is *a* network connection, not
whether your server is reachable — treat it as a hint, and let the request
failing be the real answer.

---

## Screens

```
src/screens/sync/
├── syncing.tsx        full-screen, spinner, "Pulling changes · 12 of 40"
├── sync-failed.tsx    "Continue offline" (primary) + "Try again"
├── sync-timeout.tsx   variant for the 60s limit
└── components/
    └── sync-status-pill.tsx   inline, quiet, for the offline case
```

Progress detail matters — a spinner with no numbers looks frozen after ten
seconds. RxDB emits `received$` and `sent$`; count from those.

---

## Ordering with unlock

```
unlock → open vault database → build services → start replication
       → if online: blocking sync → app
       → if offline: straight to app
```

Replication cannot start before the database exists, and the database does not
exist before unlock. Sync therefore always happens after the vault is open —
which is fine, since everything syncing is ciphertext anyway.

---

## Tests

Use a mock server, not the real API.

- push sends unsynced local docs
- pull writes remote docs into the collection
- a conflict resolves to the higher `updatedAt`
- a tombstone pulled in removes the local record
- **a tombstone pulled in does not get pushed back as a new record** — the
  resurrection test
- sync timeout after 60s proceeds offline — fake timers
- sync failure leaves the vault usable
- offline start performs no request at all
- two rounds of sync converge two simulated clients

The convergence test is the real proof: two collections, divergent edits, sync
both, assert identical state.

---

## Done when

1. Two browsers, same account, both sync and converge.
2. Deleting on one device deletes on the other and stays deleted.
3. Offline edits sync on next app open.
4. Airplane mode opens the app with no loader and no error.
5. A stopped server shows the failure screen and still lets the user in.
6. The sync loader shows real progress.
