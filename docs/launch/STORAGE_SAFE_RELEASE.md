# Attachment byte preservation blocks the next API deployment

Observed2026-11-18: existing Preview API service has **no mounted volumes**. Accepted source69c57c8 stores file bytes in its local UPLOAD_DIR. PostgreSQL stores file metadata/lifecycle, not file contents. Existing live acceptance created uploads; this does not prove every existing file belongs to synthetic accounts. Do not assume there are no customer bytes.

A new API container can discard its predecessor's ephemeral files. Reversible DB migrations, a successful build, retained metadata and a preserved old image cannot recover those bytes. This session has not acquired an authorized, complete byte backup, checked its restore, or migrated existing files. Do not deploy the new API and infer data preservation from the CI database restore. Do not delete any file/record, repoint upload paths or attach an empty volume over existing data.

## Concrete safe release sequence requiring owner-approved storage/migration access

1. Owner approves the exact persistent volume/object-storage topology, capacity/cost, retention and the authorized operations access needed to copy existing files. Do not create the resource before this decision. No credential belongs in Markdown/chat.
2. Using authorized runtime access, inventory **all** file bytes plus PostgreSQL file metadata, including revoked/deleted records; separate synthetic/customer ownership without exposing content in reports. Create a protected backup with file counts, sizes and checksums. Copy revoked/deleted bytes too; public URLs are not a complete backup interface.
3. Restore the backup into an isolated authorized target and compare checksums. Resolve missing historical bytes explicitly; never silently recreate empty files or reset sharing flags.
4. Briefly freeze only upload/byte-changing operations during the final incremental copy, or use an approved dual-write migration. Preserve messages and lifecycle states; do not enable external delivery or alter Preview Sleep.
5. Configure the approved durable store, verify it contains the complete copy before mounting/switching it, deploy accepted API then compatible Web on the existing services, and run actual file/history/role/revocation acceptance. Verify bytes survive a controlled container replacement before making durability claims.
6. Run the prepared gated workflow live-enterprise-release-acceptance.yml against the actually deployed accepted source. It tests new staff report columns and widget audio/video, which current69c57c8 does not provide. Keep the earlier live44165829215 evidence valid only for its old scope.

Rollback must retain migrations109/110, existing file names/records/bytes, DB-authoritative revocation/deletion gates, safe message URLs and upload validation. Never deploy an old API that ignores lifecycle state. Prefer a forward fix or compatibility rollback with the same approved storage, not an unqualified image rollback.

Status: **BLOCKED — EXTERNAL** for the next API/Web release until byte preservation can be performed safely. Independent code and isolated acceptance can finish without this input. This is a release/data-preservation gate, not a claim that the new code failed CI. Current API/Web69c57c8 and Sleep settings are deliberately retained.

After a verified safe deployment, trigger the gated workflow via workflow_dispatch where available, or commit a reviewed change to its script/workflow with `[verify-enterprise-release]` in that commit message. Ordinary evidence commits skip this live job. Do not use the marker while current69c57c8 is deployed; its old feature set must not be tested as the new release.
