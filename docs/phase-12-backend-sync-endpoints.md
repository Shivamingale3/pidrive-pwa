# Phase 12 — Backend Sync Endpoints

**Goal:** the two endpoints RxDB replication needs, implemented in FastAPI.

**Depends on:** Phases 5, 6, 9.

**Produces:** a server that can hand out changes and accept them, without ever
understanding them.

---

## Model

```python
class VaultRecord(Base):
    __tablename__ = "vault_records"
    id: Mapped[str] = mapped_column(primary_key=True)          # client ULID
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    collection: Mapped[str]                                    # "notes" | "passwords"
    created_at: Mapped[str]
    updated_at: Mapped[str]                                    # CLIENT-SET. Never touch.
    deleted: Mapped[bool] = mapped_column(default=False)
    ciphertext: Mapped[str | None]                             # opaque
    iv: Mapped[str | None]

    __table_args__ = (
        Index("ix_sync", "user_id", "collection", "updated_at", "id"),
    )
```

The composite index is the whole performance story. Its column order must match
the sort order in the pull query exactly.

### Three rules the server must never break

1. **Never generate `updated_at`.** The client sets it. The entire protocol
   compares client timestamps; a server-side `onupdate` silently breaks change
   detection and conflict resolution at once.
2. **Never inspect `ciphertext`.** It is an opaque string. Store it, return it,
   nothing else.
3. **Never trust a client-supplied `user_id`.** Take it from the verified
   signature.

---

## Pull

```
POST /sync/{collection}/pull
{ "checkpoint": { "updatedAt": "...", "id": "..." } | null, "limit": 50 }

→ { "documents": [...], "checkpoint": { "updatedAt": "...", "id": "..." } }
```

The checkpoint is a cursor. Familiar shape: `?updatedAfter=X&limit=50`, repeated
until a short page.

```sql
WHERE user_id = :me AND collection = :collection
  AND (updated_at > :cp_updated
       OR (updated_at = :cp_updated AND id > :cp_id))
ORDER BY updated_at ASC, id ASC
LIMIT :limit
```

**The tie-break is not optional.** Ten records can share a millisecond. Without
`id` in both the filter and the sort, a page boundary landing inside that group
silently drops records. This is the single most common sync bug and it does not
show up until you have enough data.

`checkpoint: null` means first sync — start from the beginning.

The new checkpoint is taken from the last document returned. If nothing is
returned, echo the incoming checkpoint back.

Deleted records come through this same channel as documents with
`_deleted: true`. A deletion must be something the client *receives*, not an
absence it has to infer.

---

## Push

```
POST /sync/{collection}/push
{ "rows": [ { "assumedMasterState": {...} | null, "newDocumentState": {...} } ] }

→ { "conflicts": [ {...server's current version...} ] }
```

Each row says: *"I believe you currently hold this version. If I'm right, take
my new one."*

```python
for row in rows:
    current = get(row.new.id, user_id, collection)

    if current is None:
        if row.assumed is None:
            insert(row.new)
        else:
            conflicts.append(...)          # deleted elsewhere
    elif current.updated_at == row.assumed.updated_at:
        update(current, row.new)
    else:
        conflicts.append(to_dict(current))
```

This is optimistic concurrency — the same idea as
`UPDATE ... WHERE id = ? AND version = ?` returning zero rows, or an `If-Match`
header on a REST PUT.

**The server never merges.** It says yes, or hands back what it has. It cannot
merge: it sees only ciphertext. Resolution happens client-side on decrypted data.

Empty `conflicts` means everything was accepted.

Process the whole batch in **one transaction**. A half-applied push leaves the
client's checkpoint lying about what the server holds.

---

## Tombstones

On delete, keep the row, set `deleted = True`, and **null out `ciphertext` and
`iv`**.

### Why the row stays

```
Day 1    phone, laptop, tablet all have note X
Day 2    phone deletes X permanently; server and laptop drop it
         tablet is offline, hears nothing
Day 180  tablet syncs: "I have X, you don't — take it"
         → X resurrects everywhere
```

The tablet is not malfunctioning. Pushing records the server lacks is exactly
what sync does. Without a marker it cannot distinguish "deleted while I was away"
from "new, never seen". The tombstone answers its push with "known, deleted".

**Tombstones are kept indefinitely.** Purging them reopens that window for any
device offline longer than the retention period. At this scale the cost is
negligible. (Distributed databases solve this the same way — Cassandra's
`gc_grace_seconds` is the canonical example.)

Stripping the payload means a deleted password's ciphertext does not live on the
server forever.

---

## Tests

- pull with `null` checkpoint returns everything from the start
- pull with a checkpoint returns only later records
- **eleven records sharing one timestamp, `limit=10`** — the second page returns
  the eleventh and nothing is skipped
- push with a matching assumed state is accepted
- push with a stale assumed state is rejected and returns the current version
- push with `assumed: null` on an existing id conflicts
- deleting strips ciphertext and keeps the row
- tombstones are returned by pull
- **user A cannot pull or push user B's records** — write this first
- a failed row rolls back the whole batch

---

## Done when

1. Pull paginates correctly through a dataset with duplicate timestamps.
2. Push accepts clean writes and rejects stale ones.
3. Deletes produce payload-free tombstones that replicate.
4. Cross-user access is impossible.
5. No endpoint works without a valid signature.
6. `grep -ri "decrypt\|plaintext" app/` finds nothing.
