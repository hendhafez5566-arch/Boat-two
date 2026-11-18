# Protected attachment snapshot tooling

Not imported by the API, not a migration and not a public export endpoint. Never run backup/restore against customer bytes until the owner approves runtime access, protected destination/key handling, copying and upload quiescence. Current container must stay in place. See docs/launch/STORAGE_OPTIONS_APPROVAL.md.

- `inventory(root, records)` hashes every regular file at the upload root and compares all metadata, including revoked/deleted records. Missing historical bytes, size mismatches and orphans are distinct. Symlinks/subdirectories/duplicate or traversal names fail closed. The source and DB are not modified.
- `backup(...)` requires explicit caller-declared quiescence, checks stable full metadata/bytes before and after copying, writes AES-256-GCM with a fresh IV and SHA-256 per file. It includes orphan bytes and full metadata in encrypted form. Output is exclusive0600 and cannot be under the upload root or a Git checkout. A historical missing file makes snapshotComplete=false; no row is silently repaired.
- `restore(...)` authenticates the complete archive into a private temporary location before extracting. It rejects corruption/wrong keys/truncation, duplicate/traversal names, bad lengths/hashes and existing destinations. A new0700 destination contains `files/` and0600 `metadata.json`. Metadata flags are preserved as evidence; the database is never rewritten. No restored file is publicly served by this tool.
- Every result keeps cutoverReady=false. A successful archive/restore proves a snapshot, not a live freeze, final migration, durable container replacement, Production or commercial acceptance.

CLI (only from a verified authorized runtime with the actual absolute root):

```bash
node /approved-tool/attachment-snapshot.mjs inventory --root /verified/actual/uploads
node /approved-tool/attachment-snapshot.mjs backup --root /verified/actual/uploads --archive /approved/private/attachments.backup
node /approved-tool/attachment-snapshot.mjs restore --archive /approved/private/attachments.backup --destination /approved/private/new-restore
```

These are templates, not executed commands. The script is new and is not present in current69c57c8; transfer it through approved private runtime access without deploying/replacing the API. Set BOAT_API_PACKAGE to the verified API package.json if the script is copied elsewhere. DATABASE_ADMIN_URL is consumed from existing protected runtime environment. BOAT_BACKUP_KEY must be a separately protected random64-hex key, never a command-line literal or log. BOAT_UPLOADS_QUIESCED=true is allowed only after the actual approved freeze is enforced. Do not store a customer manifest/archive inside this repository, CI artifacts, public URLs or chat. Maintain secure key escrow separately from the archive.

Read-only SQL uses an explicit READ ONLY transaction and verifies bypass-RLS authorization before global inventory. No app_user connection is treated as a successful empty global inventory. CLI stdout contains aggregates only; failure output is generic to avoid leaking names, IDs or connection strings. Unit and dedicated real-PostgreSQL acceptance use generated synthetic bytes exclusively.

Capacity planning: the encrypted JSONL/chunk format uses base64, adding about one third before metadata/encryption overhead. Backup returns actual archiveBytes. Restore temporarily needs authenticated plaintext archive space plus extracted file space in the protected destination parent; measure free space before live operation. No compression/antivirus or enforcement of the caller-declared upload freeze is claimed.
