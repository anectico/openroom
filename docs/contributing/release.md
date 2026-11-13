# Prepare and validate a release

A local candidate is not a public release. Keep an accurate record in `docs/reviews/` of the tested
revision, image ID, artifacts, checks and limitations. Do not publish, tag, push or deploy merely to
make a local check succeed. Live VPS/domain validation and npm/GHCR publication require the owner's
launch instruction and credentials.

## Local build and packages

Use Node 24, `npm ci` and `npm ci --prefix cli`. Run `npm run lint`,
`node scripts/generate-cli.ts --check`, `bash -n` and ShellCheck on both deploy scripts. The generated
CLI catalog is excluded from formatting; its exact generation is checked in CI. The repository has
no committed test suite. Write real SQLite/disk/S3 throwaway checks outside the tree, run them and
delete them before committing. Do not mock OpenRoom's own modules.

```sh
npm run cli:pack
docker build --build-arg OPENROOM_VERSION=v0.1.0 -t openroom:local-release .
```

Install the generated tarball into a separate temporary npm project. Exercise authentication,
recursive upload, confirmation, DELETE, version mismatch and doctor against the running image.
Exercise MCP with both protocol generations and verify the tool names match the operation registry
and the CLI catalog. Test revocation and demotion using an already connected client.

Check dependencies with `npm audit --omit=dev`; classify remaining advisories by their actual call
path and document them. Scan non-ignored working-tree files as well as Git history for secrets.
Review access, sanitization, outbound requests, migration, erasure and recovery paths with real
files and sessions. Record any unavailable independent review without treating it as a clean report.

## Isolated clean local server

An unpublished candidate can be installed on an isolated Linux VM or Docker-in-Docker server. Never
use another project's Docker socket or data volume. Start with no OpenRoom install or volumes.
Preload the candidate image as `ghcr.io/anectico/openroom:0.1.0` and Caddy 2.11.8. Copy the actual
`deploy/` folder to `/candidate-deploy`, then follow [the install runbook](../agents/install.md):

```sh
umask 077
bash /candidate-deploy/install.sh --email owner@example.test --domain localhost \
  --version v0.1.0 --source /candidate-deploy --dir /opt/openroom --yes --json > /root/install-result.json
```

Use `localhost` only inside the isolated server. Caddy issues a local CA certificate. Install that CA
in this throwaway server's trust store and verify HTTPS normally; never use `curl -k` to claim TLS
success. Verify the install result without printing secrets, `.env` mode 600, removal of
`ADMIN_PASSWORD`, owner sign-in, API-key bootstrap, MCP and `openroom-server doctor --json`.
Local same-server replication is expected to raise the admin warning. The doctor must still confirm
that replication works. Free at least 10% and 2 GiB of disk so low-space checks can pass.

Run the written steps through an independent coding agent when available. Give it only the README,
runbook and isolated server access. Keep its original report and separately verify findings and
fixes. Local CA/VM validation does not establish public DNS, public ACME or a real VPS install.

## Update and rollback

Test a release-shaped older image and its migration journal with a real data volume. Add a room,
document and encrypted settings, update, then verify integrity and contents. The local deploy folder
can be used for an offline update, avoiding unpublished GitHub files:

```sh
openroom-server update v0.1.0 --source /candidate-deploy
openroom-server doctor --json
openroom-server rollback --yes
openroom-server doctor --json
```

Use explicit disposable version tags for the fixture; do not publish them. Verify a schema rollback
selects the snapshot before the first unknown migration, retains the replaced database and uses a
new replica prefix. Retry a failed reset without swapping twice. Carry current storage configuration
exactly, including removed S3 settings, and current object locations. Check rollback after both
bucket and disk moves. Never edit or replace the live database directly.

## S3 and restore

Use a dedicated local S3-compatible service and fresh buckets. Test multipart upload above 5 GiB,
source/destination checksums, failure/retry/cancel, pending uploads and frozen archives. Keep old
buckets. Test released-file retention at day 29 and after day 30, and first-seen stray grace.
For a fast local retention check, invoke the actual cleanup function with an explicit future clock
argument; record this as controlled-clock validation, not 29 days of elapsed time.

Confirm real Litestream replication, record a real `RESTORE_AT` cutoff, change/delete data afterward,
stop the source and restore into a fresh data volume with the original key. Verify the selected
point, referenced bytes, encrypted settings and new CURRENT prefix. A wrong key, missing file or bad
replica must fail before seeding or changing CURRENT. Clear old-server local snapshot metadata on
fresh restore; updates on the new host create their own rollback snapshots. Never start the old
server after restore into the same active replica prefix. Use a separate fresh prefix for a rollback
fixture. Run doctor after removing one-time S3 environment credentials.

## Publish after authorization

The tag workflow validates source and CLI catalog, builds amd64/arm64 images, publishes GHCR tags,
publishes the CLI with provenance and creates the GitHub release after both succeed. The CLI package
version must match the `v` tag. Configure a suitably scoped npm publishing credential as `NPM_TOKEN`
or a compatible trusted publishing setup before running it; see
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/).
The workflow itself does not provide registry access. First publication, live provider credentials,
public HTTPS and the clean VPS run remain explicit launch tasks.

After successful publication, follow the public one-command install from the README on a clean VPS,
run doctor, test real email and storage integrations if enabled, validate investor gates and check
that no validation secrets or throwaway scripts are committed.
