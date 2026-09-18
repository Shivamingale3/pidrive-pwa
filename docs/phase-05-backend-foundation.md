# Phase 5 — Backend Foundation

**Goal:** a FastAPI service with a database, user and device models, and manual
account creation. No vault endpoints yet.

**Depends on:** nothing on the client. Can be built in parallel with Phases 2–4.

**Produces:** a running API with health check, migrations, and an admin script
that creates an account.

---

## Separate repository

`pidrive-api`, not a folder inside the PWA. Different language, different deploy
target, different lifecycle.

---

## Stack

```
FastAPI · PostgreSQL · SQLAlchemy 2.x · Alembic · Pydantic v2 · uv
```

```bash
uv init pidrive-api && cd pidrive-api
uv add fastapi uvicorn[standard] sqlalchemy psycopg[binary] alembic pydantic-settings
uv add --dev pytest pytest-asyncio httpx ruff mypy
```

---

## Layout

```
app/
├── main.py              FastAPI app, router registration
├── config.py            pydantic-settings, env-driven
├── db.py                engine, session factory, Base
├── models/              SQLAlchemy models
│   ├── user.py
│   ├── device.py
│   └── vault_record.py  (Phase 12)
├── schemas/             Pydantic request/response models
├── routers/
│   └── health.py
├── services/            business logic — routers stay thin
└── security/            signature verification (Phase 6)
alembic/
tests/
scripts/create_user.py
```

**Routers parse and delegate.** Business logic in a router is untestable without
HTTP. Same layering principle as the client: thin edges, logic in the middle.

---

## Models

```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True)          # ULID
    email: Mapped[str] = mapped_column(unique=True, index=True)
    password_hash: Mapped[str]
    created_at: Mapped[datetime]

class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(primary_key=True)          # client ULID
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    public_key_jwk: Mapped[dict] = mapped_column(JSONB)        # plaintext
    name: Mapped[str | None]
    created_at: Mapped[datetime]
    last_seen_at: Mapped[datetime | None]

class VaultKeyBlob(Base):
    __tablename__ = "vault_key_blobs"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    wrapped_key: Mapped[str]        # recovery-wrapped. Server CANNOT open this.
    kdf_salt: Mapped[str]
    kdf_iterations: Mapped[int]
    updated_at: Mapped[datetime]
```

Notes that matter:

- `public_key_jwk` is **plaintext**. A public key only verifies; encrypting it
  would break its only purpose.
- `wrapped_key` is opaque. The server stores and returns it. It never has the
  recovery key and can never open it. Comment this in the model so nobody
  "improves" it later.
- There is no PIN column, no vault key column, no recovery key column. If a
  migration ever adds one, something has gone badly wrong.

---

## Account password

The account password is **not** the vault password. It authenticates to the API;
it never touches vault encryption. Forgetting it must not destroy the vault —
that is precisely why the Recovery Key exists.

Hash with Argon2id via `argon2-cffi`. Server-side there is no WASM objection.

```bash
uv add argon2-cffi
```

---

## Closed registration

No signup endpoint. Accounts are created by:

```bash
uv run python scripts/create_user.py --email a@b.com
```

Generates a random initial password, prints it once, stores only the hash.

---

## Config

```python
class Settings(BaseSettings):
    database_url: PostgresDsn
    cors_origins: list[str]
    environment: Literal["dev", "prod"]
```

Env-driven, no defaults for secrets. A default database URL in source is how
staging credentials end up in git.

CORS must list the PWA origin explicitly. `allow_origins=["*"]` with credentials
is both invalid and a vulnerability.

---

## Migrations

Alembic from the first commit. Autogenerate, then **read the generated file**
before applying — autogenerate misses type changes and enum edits regularly.

---

## Tests

- `create_user` inserts a user and stores a hash, not the password
- duplicate email rejected
- health endpoint returns 200
- config raises when a required env var is missing

Use a separate test database and roll back per test.

---

## Done when

1. `uv run uvicorn app.main:app --reload` serves `/health`.
2. `alembic upgrade head` builds the schema from empty.
3. `create_user.py` creates an account and prints a password once.
4. `pytest` passes.
5. No column anywhere could hold a PIN, a vault key, or a recovery key.
