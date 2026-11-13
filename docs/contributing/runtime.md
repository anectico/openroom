# Runtime

How the pieces start, stop and recover. Code paths are under `src/launcher/`, `src/server/` and
`src/lib/server/`.

## Processes

The container runs `tini`, which runs the launcher (`src/launcher/index.ts`). The launcher:

1. Restores the database when `RESTORE_FROM` is set and no database exists yet. A missing replica
   stops the start; nothing is created.
2. Swaps in the rollback snapshot when `openroom-server rollback` left a marker
   (`/data/rollback.json`), carrying the live storage settings and object locations across, runs
   `litestream reset` and starts a new replica prefix. The replaced database is kept next to it as
   `replaced-<time>.db`.
3. Writes the Litestream configuration for the current prefix and starts the app
   (`src/server/index.ts`) with an IPC channel.
4. Starts `litestream replicate` once the app reports ready, so a fresh install's database exists
   first, and restarts it with backoff if it stops. When Litestream has been down for 10 minutes it
   asks the app for a `PASSIVE` checkpoint, every 10 minutes while it stays down, so the WAL stays
   bounded.

On SIGTERM the launcher stops the app (up to 45 seconds), then Litestream, so the last changes are
replicated. Compose gives the container 60 seconds.

The TypeScript in these folders runs directly on Node 24, which strips types, so it uses only
erasable syntax and imports with `.ts` extensions.

## Our server

`src/server/index.ts` wraps adapter-node's `handler`:

- `ORIGIN` pins the host and protocol of every request, because adapter-node 6 no longer reads
  `ORIGIN` and would otherwise trust the `Host` header.
- Upload URLs (`/upload/...`) are handled before SvelteKit, with no body limit; every other route
  keeps SvelteKit's 1 MB limit.
- Every request gets `x-openroom-ip`, the client IP from `ADDRESS_HEADER`/`XFF_DEPTH` or the socket,
  overwriting any value the client sent; Better Auth's rate limits read it.
- No total request time limit; any connection idle for 60 seconds is closed, and a request other than
  an upload gets 2 minutes to send its headers and body.
- On shutdown it stops taking requests, lets uploads finish for up to 30 seconds, stops the jobs loop
  and closes the database.

Importing the handler runs SvelteKit's `init` hook, which starts the runtime (`src/lib/server/runtime.ts`):
migrations, the database connection, the secret-key check and re-encryption (see
[configuration](../configuration.md#rotating-the-secret-key)), the one-time owner seed and the jobs
loop. If any step fails, the app logs the reason and exits, and the launcher stops with it. The runtime publishes its stop and checkpoint
functions on `globalThis`, so the server and the bundled app share one database connection. `npm run
dev` starts the same runtime through the same hook.

## Database

Every connection sets WAL mode, `busy_timeout=5000`, `wal_autocheckpoint=0` and foreign keys on. The
app never checkpoints; Litestream does.

## Migrations

drizzle-kit writes the SQL files and journal in `migrations/`. Our runner (`src/lib/server/db/migrate.ts`):

- stops the start when an applied migration was edited, when the database has a migration this image
  does not know (an older image on a newer database), or when an earlier migration was skipped;
- before the first pending migration of an existing database, writes one `VACUUM INTO` snapshot to
  `/data/snapshots/`, records it in `_snapshots` with the migration it precedes and the image version,
  and deletes older snapshots;
- runs each file in its own transaction on a connection with foreign keys off, with
  `foreign_key_check` before each commit and `integrity_check` before and after.

Applied migrations are recorded in `_migrations` with the hash of their file.

## Rollback

`openroom-server rollback` reads the previous image's migration journal and asks the app
(`src/launcher/tools.ts rollback-plan`) whether the database has migrations the previous image lacks.
If not, it only switches the image. A configured S3 install first requires the target image to
confirm S3 capability; an older incompatible image is refused before stopping the app. If a schema
swap is needed, it shows what will be discarded, asks, writes the marker,
and restarts on the previous image; the launcher swaps the snapshot in before the app starts.
Before swapping, it persists a prepared intent with the replacement path and fresh replica prefix.
A failed reset leaves this intent intact. Restart resumes it on the same new prefix even when the
swapped database already matches the older migration journal. A prepared rollback cannot be
cancelled; it must finish its reset before the app can start.

## Replica prefixes

`CURRENT` at the replica root lists every prefix with the time it started and why (first, rollback,
restore). The last line is the active prefix. A restore picks the prefix that covers `RESTORE_AT`, and
a restored or rolled-back database always replicates to a new prefix, so it never writes into the
history it came from.

## Storage and replication health

The app sends encrypted-settings-derived S3 configuration to its launcher over IPC when ready and
when an owner saves new credentials. The launcher stops the old Litestream child, writes a
secret-free configuration and restarts only that child. Credentials enter the child's environment,
not YAML or logs. Failed configuration changes retry with backoff.

Every 30 seconds the launcher runs `litestream sync -wait -json` through the control socket, with a
bounded timeout. Matching database and replica transaction IDs confirm synchronization. The app
stores the result for the setup card and warnings; it expires after 90 seconds. A persisted
configuration or a running child alone is insufficient. The system-health job emits low-disk and
replication notices. See [storage and recovery](../storage-and-backups.md).

Migration `0010_s3_upload_location` records where a pending upload is streamed. Objects already have
location metadata. Reads from an older snapshot marked as disk may fall back to S3 after a verified
move removed the local copy. Frozen archives are also copied to S3. Restore checks saved secrets
and required object sizes in a staging database before changing the pointer or live database.
The image copies shared schemas as well as server and launcher sources, because startup storage
validation runs directly under Node rather than through the SvelteKit bundle.

## Personalization migration

Migration `0012_investor_welcome_and_pins` adds nullable link welcomes and an initially empty
`room_pins` table with cascading room/file references and a unique order per room. Existing room
introductions, links and documents remain unchanged. The normal runner creates the pre-migration
snapshot. An older journal refuses this upgraded database; use the launcher rollback workflow,
not manual column/table removal. Snapshot rollback discards changes since that snapshot from the
active database, including new notes and pins, and preserves the replaced database for recovery.
The [local upgrade/rollback drill](../reviews/2026-11-13-personal-welcome-and-pins.md) verified
secret decryption, disk document bytes, integrity checks and replica-prefix advancement.

## Jobs

`src/lib/server/jobs.ts`: `defineJob(kind, handler, { everyMs })` registers a handler and, optionally,
a schedule; `enqueue(kind, payload)` adds a job in the caller's transaction. The loop claims one due
job at a time, retries failures with exponential backoff up to `max_attempts`, and reschedules
scheduled jobs after each run. Jobs left locked by a stopped process are released at start.

Migration `0013_investor_attention` creates the investor visit snapshot and reply-read tables without
rewriting existing records. Upgrades use the normal pre-migration snapshot. An older journal refuses
the new schema; rollback uses the launcher to restore the snapshot and retains the replaced database.
As with other schema rollbacks, post-snapshot changes are excluded from the restored live database.

Migration `0014_investor_reviews` adds an initially empty review table with cascading file, viewer and
session references. Existing records are unchanged. The normal pre-upgrade snapshot and launcher
rollback workflow apply; an older journal refuses the upgraded database. Rollback restores the
snapshot, so subsequent checklist choices and other post-snapshot changes are not in the restored
live database. The replaced database is retained for recovery. See the
[follow-through verification](../reviews/2026-11-13-investor-follow-through.md) for the real upgrade and
launcher rollback drill, including document bytes and secret decryption.
