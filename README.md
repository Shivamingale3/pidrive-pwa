# Vault PWA — Development Decisions

## Stack

- Frontend: React + TypeScript + Vite.
- Backend: Python + FastAPI.
- Server role: API/CRUD and authentication verification; the server does not perform vault encryption/decryption.
- Client-side cryptographic operations are performed in the PWA.
- Client persistent storage: IndexedDB.
- Browser `localStorage` is not used for secrets.

## Authentication

- First-time device flow:
  1. User logs in with account credentials.
  2. Client generates an authentication public/private key pair.
  3. Client registers the public key with the server.
  4. Client sets up the local PIN.
  5. User enters the vault.

- Subsequent launches on a registered/trusted device:
  - User is asked for the local PIN instead of account credentials.
  - Successful PIN verification unlocks the local vault.

- Device authentication is separate from vault encryption.

## Auth Key Pair

- Algorithm: ECDSA.
- Curve: P-256.
- Hash: SHA-256.
- Private key:
  - Generated on the client.
  - Non-extractable Web Crypto `CryptoKey`.
  - Stored locally in IndexedDB.
  - Never sent to the server.
- Public key:
  - Generated alongside the private key.
  - Stored locally.
  - Registered/stored on the server.
- Server authentication uses a signed request payload plus replay-protection data (for example, a fresh server challenge/nonce); the server verifies the signature using the registered public key.

## PIN / Local Trust

- PIN is only for local app trust/unlock.
- PIN is never sent to the server.
- The raw PIN is never stored.
- A salted, slow PIN-derived verifier is stored locally in IndexedDB.
- Initial KDF: PBKDF2-HMAC-SHA-256.
- Exact PBKDF2 iteration count and PIN policy will be fixed during implementation/security review.

## Vault Encryption

- A random Vault Encryption Key is generated on the client.
- Vault data (passwords and notes) is encrypted/decrypted on the client.
- Algorithm: AES-256-GCM.
- A fresh random IV is used for each encryption operation.
- The Vault Encryption Key is not sent to the server in plaintext.

## Recovery

- A cryptographically random 256-bit Recovery Key is generated on the client.
- The Recovery Key is presented to the user for offline safekeeping.
- The server does not store the Recovery Key.
- The Recovery Key is not used directly to encrypt vault records.
- The Recovery Key is used to derive/provide a wrapping key that protects the Vault Encryption Key.
- Vault Encryption Key wrapping algorithm: AES-256-KW.
- The server stores the wrapped/encrypted Vault Encryption Key.
- Recovery flow:
  1. User logs in again after losing local PWA/browser storage.
  2. Client retrieves the encrypted vault and wrapped Vault Encryption Key.
  3. User supplies the Recovery Key.
  4. Client derives/provides the AES-256-KW wrapping key.
  5. Client unwraps the Vault Encryption Key.
  6. Client can decrypt the vault and establish new local device state.

## Key Relationships

```text
Recovery Key
    |
    | AES-KW wrapping
    v
Vault Encryption Key
    |
    | AES-256-GCM
    v
Encrypted Vault Data
```

## Client Storage

```text
IndexedDB
├── auth
│   ├── privateKey
│   └── publicKey
├── unlock
│   ├── pinSalt
│   └── pinVerifier / derived material
└── vault
    ├── wrappedVaultKey
    └── encryptedData
```

- Decrypted vault data and the active Vault Encryption Key exist only in application memory while the vault is unlocked.
- When the vault is locked, sensitive plaintext state is cleared from memory as far as practical.

## Server-Side Stored Data

The server may store:

- Account/user data.
- Registered public authentication key.
- Wrapped Vault Encryption Key.
- Encrypted vault data.
- Metadata required for API/authentication and CRUD operations.

The server must not store:

- Authentication private key.
- Recovery Key.
- Plaintext Vault Encryption Key.
- Plaintext passwords or notes.
