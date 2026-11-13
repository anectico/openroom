# Agent runbook

Read [the operation model](../contributing/operations.md) and the live tool catalog before changing
OpenRoom. The registry is the source for admin actions, REST, OpenAPI, MCP and the generated CLI.
`GET /api/v1/openapi.json` describes the current REST API.
Authenticate with a member API key; its role is loaded for every request.

If access changes during a request, refresh the member or key state before retrying; do not reuse a
cached role. Finish uploads before their returned expiry, and retain the original expected checksum.
An expired upload needs a new `create_upload`. File requests also follow a reduced install upload
limit. Activity filters combine a supplied link and group and apply to current viewers too.

For a failed zip or archive, inspect its status and source files. Stream errors fail the export and
reach the retry worker without stopping the app. Expired pending exports do not reserve build slots.
The [30-fix review](../reviews/2026-11-11-bugfixes.md) records the reproduced failures and checks.

## Storage

Use `get_storage_settings` to inspect counts and `get_system_status` for disk and confirmed replica
health. Never retrieve or print settings-table secrets. An owner can call
`update_storage_settings` to probe and save a dedicated bucket, `test_storage` to check file access,
`retry_storage_move` after correcting a copy failure, and `test_replication` to ask the launcher for
remote confirmation. Check both object counts and replica health before describing backups as ready.
Bucket changes and S3-to-disk moves use `move_storage`, with copy/check/switch and paused uploads. Keep the old bucket for at least 30 days. See [storage and backups](../storage-and-backups.md).

Storage settings and their HTTP routes are declared in `src/lib/operations/storage.ts` and
`system.ts`. Credentials never appear in their output or audit detail. Do not bypass an access gate
or turn verification off as a way to make a check pass.

## Privacy

Use `export_viewer_data` for an investor data request. `erase_viewer` requires an admin or owner and
`confirm: true`; first obtain the concrete effect by calling without confirmation when presenting
it to the operator. Scope is one investor. NDA evidence, hashed blocks and retained backup bytes
have the exceptions documented in [investor data](../privacy.md). Do not promise physical erasure
from backup history.

## Restore and rollback

The old server must be stopped. Supply the original secret key and the exact bucket configuration
before starting a fresh volume. Follow the [restore procedure](../storage-and-backups.md#restore-on-a-fresh-server).
Never copy a database over the running app. A failed key or file check must leave the current pointer
and live database unchanged. The launcher alone restores and swaps snapshots.

For a schema rollback, inspect `openroom-server rollback`'s plan and the snapshot. Changes since the
snapshot are discarded. The host command checks the target image
for an explicit S3 capability before stopping a configured install. An image predating S3 support
cannot serve remote files, so rollback to it is refused before making changes. The migration drill in this revision exercises the current launcher's
snapshot swap against the earlier journal; it is not a compatibility test of an older released image.

After any recovery, run `openroom-server doctor`, `verify-restore` inside the app container, a known
member sign-in, an investor gate and file/range downloads. Confirm a new `db/CURRENT` prefix and
successful remote synchronization. Reapply privacy changes made after the recovery point before
reopening the installation.

## Verification and delivery

Use disposable databases, files and buckets. Throwaway checks belong outside the repository; never
commit tests or code comments. Check affected access paths against real SQLite and real storage,
then run `npm run lint`, `npm run build`, shell syntax checks and the Docker build. UI changes also
need actual desktop and phone screenshots plus interactions. A clean-server install runbook and
day-29 recovery remain required release work. Do not treat a local container drill as a VPS install.
