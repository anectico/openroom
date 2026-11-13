# Storage and backups

OpenRoom works with local disk and a local database replica. Both copies are on the same server:
losing that server loses both. Optional S3 stores documents and the database replica away from it.

## Connect a private bucket

1. Open **Settings → Storage & backups** as an owner. Create a dedicated private bucket in your
   storage account. Leave public access off; browser requests go through OpenRoom's access checks.
2. Create credentials restricted to that bucket. Allow listing objects and multipart uploads,
   reading, writing, deleting and aborting multipart uploads. Include both `files/` and `db/`;
   frozen room archives also use `exports/`. Litestream needs conditional writes for `db/CURRENT`.
3. Enter the bucket name, S3 endpoint, region, access key ID and secret access key. Copy the endpoint
   from the provider, without the bucket name or an extra path. Keep path-style requests on unless
   the provider requires otherwise. AWS S3 can use an empty endpoint and its actual region.
4. Choose **Connect storage**. OpenRoom tests the bucket before saving encrypted credentials. An
   existing `db/CURRENT` is refused: recover that install through the restore procedure instead.
5. Keep the server until **On this server** reaches zero and **Check replication now** succeeds.
   Connecting the bucket starts a background copy of all retained objects. Each disk copy is removed
   only after reading the remote copy back and checking its size and SHA-256. A failure keeps the
   disk copy and exposes **Retry file move**.
6. Save the install's `OPENROOM_SECRET_KEY` outside the server. A database backup cannot decrypt
   saved credentials, links or webhook secrets without that key.

New uploads stream straight to the bucket, including multipart uploads above 5 GiB. The server keeps
at least 1 GiB free for database and temporary work. Zip exports and archive creation still use disk
space; moving documents to S3 does not remove this requirement.

Credentials can be replaced with another key for the same bucket; OpenRoom verifies that it can
read an existing stored object before saving them. To change the bucket, endpoint, region or
path-style choice, use **Move storage → Choose destination**. Choose a new private S3 bucket or
local disk, then review the effect and confirm. The `move_storage` operation exposes the same flow
to agents. Server environment overrides must be removed before a settings-managed move.

Uploads pause during the move. Existing reads keep using the source. Every retained document,
received unfinished upload and frozen archive is copied and checked by size and SHA-256 before
OpenRoom switches settings and database replication. A failed move leaves the original storage
active and shows Retry and Cancel. Cancel retains partial destination copies. Local disk needs
enough free space for all retained files plus the safety margin.

**Keep the old bucket for at least 30 days. OpenRoom never empties it.** Earlier database replicas
and file locations may still need it. A move starts a fresh database replica prefix at the new
location. Moving to disk returns to same-server protection and restores the remote-backup warning.
Do not delete source data as a workaround for a failed move.

## Providers with a free allowance

These are optional examples, checked against the providers' documentation on 11 November 2026.
Account limits apply to documents, retained versions, archives and database backups together.

- **Cloudflare R2 Standard:** region `auto`; use the account's S3 endpoint and credentials scoped
  to the bucket. Its free allowance includes 10 GB-month of storage, one million Class A operations
  and ten million Class B operations per month. Follow the
  [S3 setup guide](https://developers.cloudflare.com/r2/get-started/s3/) and check
  [current pricing](https://developers.cloudflare.com/r2/pricing/).
- **Backblaze B2:** copy the S3 endpoint and matching region from the private bucket's details;
  use an application key scoped to it. The first 10 GB of storage are free; download and transaction
  allowances also apply. Check [current pricing](https://www.backblaze.com/cloud-storage/pricing)
  and the provider's setup instructions before connecting.

The implementation has been exercised against a real local S3-compatible service. A live account
on either hosted provider has not been used for this validation.

## Know whether backups are working

The launcher asks Litestream to synchronize through its control socket and waits for remote
confirmation. A running process, a recent local file or a saved bucket setting alone does not mark
backups as ready. The check runs every 30 seconds; an old or failed confirmation raises a warning.
Backups are ready only after every retained disk object has moved as well.

The overview setup card, workspace warnings and Storage & backups page expose this state.
Replication failures and low disk space generate notices, with optional email and webhook delivery.
The first 90 seconds after startup allow replication to initialize before an outage notice is sent.
Run `openroom-server doctor` on the host for database, migration, replica, disk and process checks.

## Retention and prefixes

Litestream is configured with 720 hours of database snapshot retention. The bucket's `db/CURRENT`
records each replica prefix and its start time; the last entry is active. A restore or schema rollback
starts a new prefix so subsequent writes cannot replace the history used to recover. `--restore-at`
selects the prefix that covers the requested time, then asks Litestream for that point.

Do not add lifecycle rules that delete active files or database history early. A daily job deletes document objects only after they have had no references for more than
30 days, and checks actual document/request/logo references before removal. A weekly scan of
`files/` on disk and the active bucket records unknown keys on first sight, then waits a further
30 days and rechecks them before deletion. It never scans or deletes `db/`; Litestream owns its
replica retention.

Ordinary orphaned exports are deleted after seven days. Frozen archives follow the room's retention
instead; an orphan archive whose room is gone uses 730 days from the timestamp in its key. Known
exports and archives retain their own database expiry rules. Cleanup pauses during a storage move.
Old buckets are retained for the owner to retire after the recovery window. Thirty-day database retention does not mean that erased investor bytes are physically removed
from every retained object or backup after thirty days. See [investor data](privacy.md).

## Restore on a fresh server

Stop the old OpenRoom server first. Two running installations must never share this bucket. Keep the
old server and bucket intact until the new server has passed the checks below.

On the fresh server, supply the bucket credentials through the environment and the original secret
key to the installer. Use the same bucket, endpoint and region as the old install. Do not paste real
keys into an issue, chat transcript or tracked file.

```sh
sudo --preserve-env=S3_BUCKET,S3_ENDPOINT,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_FORCE_PATH_STYLE \
  bash install.sh --email owner@example.com --domain room.example.com \
  --restore-from s3://your-bucket/db --secret-key "$SAVED_OPENROOM_SECRET_KEY" --yes
```

`install.sh` is the deploy installer obtained from the release being installed. For an earlier
point, add `--restore-at 2026-11-10T12:00:00Z`. A timezone is required. The owner's original account
and password are restored; the installer does not replace them with a new password.

Before making a restored database live, the launcher checks integrity, foreign keys, every saved
encrypted setting, link and webhook secret, and the presence and sizes of referenced files. A missing
file or wrong key stops startup before the live database or `db/CURRENT` is changed. It then starts
a new replica prefix. The installer runs `verify-restore`, removes one-time restore settings and S3
credentials from `.env`, restarts using the credentials encrypted in SQLite, and verifies again.
The original `OPENROOM_SECRET_KEY` stays in the protected `.env`. Rollback-snapshot metadata from
the old server is cleared, because those local snapshot files are not part of the replica. A later
update creates a new local rollback snapshot before applying migrations.

After installation:

1. Run `openroom-server doctor` and **Check replication now**.
2. Sign in with an existing account. Open a known investor link, a document and a download.
3. Check that the Storage & backups page shows the expected objects and no files left on disk.
4. Keep the old server stopped. Retain its volume until recovery is accepted.

An existing installation with an empty data volume can also use
`openroom-server restore --from s3://your-bucket/db --at TIME`, after its `.env` has the original
secret key and S3 credentials. It refuses to replace an existing database. Database replacement is
always performed by the launcher before the app starts.
