# Proposal: Run OpenRoom on Cloudflare with one Deploy button

Status: draft for decision · 26 November 2026

## Summary

OpenRoom was built to run on a VPS. One Node process runs SvelteKit, SQLite through `better-sqlite3`, a job loop and Litestream as a child process. Caddy handles HTTPS. Files go to a local disk or S3. Installing it takes a VPS, Docker, a shell installer and an `openroom-server` command for updates, rollback, restore and health checks.

This proposal makes Cloudflare the main deployment target. An owner clicks **Deploy to Cloudflare** on the README and enters their email, password and secret key. They get a working data room on their own Cloudflare account. Cloudflare then handles HTTPS, backups, updates and email. There is no server to maintain.

**Recommendation:**

- Rebuild the runtime layer and keep the product code: operations, UI, viewer, access rules and the API, MCP and CLI.
- Run SvelteKit as a normal Worker using `@sveltejs/adapter-cloudflare`.
- Store the database in **Cloudflare D1** and documents in **R2**.
- Retire the VPS installer at a tagged release instead of maintaining two runtimes.

**Plan:** The Deploy button works on the free plan. A real investor room needs **Workers Paid at $5 a month**:

1. **Email.** Cloudflare opened Email Sending to the Workers Free plan on 24 November 2026, but **free accounts can send only to recipients verified in the account**. Investors are never verified recipients. Verification codes, invitations and notices to investors therefore need Workers Paid. It includes 3,000 emails a month, then costs $0.35 per 1,000.
2. **CPU.** The free plan allows 10 ms of CPU per request. Password hashing, room index PDFs and zip exports need more.
3. **D1 write quota.** The free plan's daily D1 limits include about 100,000 written rows. Page-level reading-time tracking writes a row update every few seconds per active investor, so a busy day can reach that limit.

The free plan still works for a demo or a solo trial. The owner's own email is a verified address, and links can be shared by hand.

## Why D1

- **The Deploy button provisions it.** D1 is a documented, first-class resource for Deploy to Cloudflare and for Wrangler auto-provisioning.
- **The owner can see the data.** Tables are visible in the dashboard, with a SQL console, `wrangler d1 export` for a portable `.sql` dump, and `wrangler d1 migrations apply`. These replace much of `openroom-server doctor` and the restore toolchain.
- **Backups are included.** D1 Time Travel restores to any minute in the past 30 days on Workers Paid, or 7 days on Free. This replaces Litestream, `db/CURRENT` prefixes and the restore flow.
- **It keeps SQLite.** The 16 existing Drizzle migrations apply to D1 with little change. Drizzle has a `d1` driver.
- **The architecture is plainer than a Durable Object.** Every request is handled by a stateless Worker.

**What D1 costs us:** D1 is **asynchronous only**, and it has **no interactive transactions**. A transaction can't read a value and then decide what to write. Today the app makes 471 synchronous `prepare().get/all/run` calls across 69 files and has 10 transactions. This is the largest piece of work in the plan:

- **Make queries async.** A small shim keeps the `prepare(sql).get/all/run` shape but returns promises. Each call site gains an `await`, and each caller becomes `async`. Most of this is mechanical; `svelte-check` flags a missed `await` as a type error, because a `Promise<Row>` is not a `Row`.
- **Rewrite transactions as `db.batch()`.** A batch runs atomically. Most of the 10 transactions are already groups of writes with no reads in between, such as questions, messages and tracking, so they become batches directly. The few that read inside the transaction move the read before the batch, or rely on SQL to make the batch safe. Two examples:
  - `gates.ts`: the viewer upsert followed by session creation uses `INSERT … ON CONFLICT … RETURNING`, with IDs generated in the app.
  - `settings.ts`: the create-once key uses `INSERT … ON CONFLICT DO NOTHING`, then reads the stored key back.
- **Writes are serialized.** D1 processes writes one at a time per database, like today's single process. Job claiming already uses one atomic `UPDATE … RETURNING`, which works the same way in D1.

The alternative was one SQLite-backed Durable Object. Its synchronous API would have avoided the async conversion. It was rejected because SvelteKit would have to run inside the Durable Object, which is a less common setup. Its data is also less visible to the owner, and D1 suits the Deploy button and the dashboard better.

## Today's architecture and its Cloudflare equivalents

| Today (VPS)                                                         | Where it lives                                                                                 | On Cloudflare                                                                                                                                                                                                                                                                                     | Effort                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `@sveltejs/adapter-node` with a custom Node HTTP server             | `src/server/index.ts`, `vite.config.ts`                                                        | `@sveltejs/adapter-cloudflare` with `nodejs_compat`. Request handling, upload handling and drain logic move into the SvelteKit routes.                                                                                                                                                              | Small                  |
| SQLite through `better-sqlite3`: 471 sync calls, 10 transactions     | `src/lib/server/db/*`, everywhere                                                              | **D1** through an async shim and Drizzle's `d1` driver. Transactions become `db.batch()`. Migrations run with `wrangler d1 migrations apply` during deploy.                                                                                                                                          | **Large** (see above)  |
| Litestream, restore, rollback snapshots, `db/CURRENT` prefixes       | `src/launcher/*`, `deploy/openroom-server`                                                     | **Removed.** D1 Time Travel handles recovery. A nightly `.sql` export to R2 provides long-term, portable backups. Settings shows backup status and has a link to the dashboard's restore page.                                                                                                       | Removes ~1,000 lines   |
| `jobs` table, worker loop with heavy, outbound and light lanes      | `src/lib/server/jobs.ts`                                                                       | **Cloudflare Queues** run jobs as they are enqueued: emails, webhooks, page counts, exports. A **Cron Trigger** runs scheduled jobs (cleanup, sweeps, nightly backup) and retries anything left in the `jobs` table. Fallback without Queues: the cron drains the table every minute, and a request uses `ctx.waitUntil` for urgent sends. | Medium                 |
| FlyDrive local disk or S3, AWS SDK, multipart via `lib-storage`     | `storage.ts`, `s3.ts`, `uploads.ts`, `storage-move.ts`, `storage-transfer.ts`, `disk-space.ts` | **R2 binding only.** Uploads use the R2 multipart binding API: the browser sends parts under 100 MB, so no S3 keys are needed. Storage moves, disk-space checks and the local-to-S3 migration are removed.                                                                                          | Medium; removes a lot  |
| Nodemailer for SMTP, Resend SDK, Cloudflare REST                    | `email.ts`                                                                                     | **`send_email` binding** as the default. No token is needed, and the button sets it up. Resend stays available as an option. SMTP is removed.                                                                                                                                                     | Small                  |
| Caddy, ACME, `sslip.io`, `DOMAIN`, `ORIGIN`                         | `deploy/Caddyfile`, compose                                                                    | A `*.workers.dev` URL at first, then a custom domain from the dashboard. Client IP comes from `CF-Connecting-IP`.                                                                                                                                                                                 | Small                  |
| `install.sh`, `openroom-server` with update, rollback, doctor and restore | `deploy/*`                                                                                     | The Deploy button creates a GitHub fork connected to Workers Builds. **Update** means syncing the fork. **Rollback** uses Workers versions in the dashboard. **Doctor** becomes the existing health page in Settings.                                                                              | Removes ~1,500 lines   |
| `sharp` to re-encode logos and covers                               | `branding.ts`, `/b/logo`, `/b/cover`                                                           | The **Cloudflare Images binding** (free allowance), or re-encoding in the browser with a canvas plus strict size and type checks on the server.                                                                                                                                                   | Small                  |
| `pdfjs-dist` page counting on the server                            | `pdf.ts` (`files.pages` job)                                                                   | Count pages in the browser at upload; the viewer already loads pdf.js. The count is only for display.                                                                                                                                                                                             | Small                  |
| `archiver` zip exports and frozen room archives                     | `zip.ts`, `exports.ts`, `archive.ts`                                                           | A streaming zip library (`client-zip` or `fflate`) written to an R2 multipart upload in a queue job. Files stay uncompressed, which keeps CPU low.                                                                                                                                                 | Medium                 |
| `@cantoo/pdf-lib` room index                                        | `room-index.ts`                                                                                | Works unchanged in Workers. It is pure JavaScript.                                                                                                                                                                                                                                                | None                   |
| Better Auth with API keys                                           | `auth.ts`                                                                                      | Use Better Auth's Drizzle adapter on D1. Replace the default pure-JS scrypt with WebCrypto PBKDF2 to keep sign-in CPU low.                                                                                                                                                                        | Small                  |
| MCP `createMcpHandler`, REST, OpenAPI                               | `http/*`                                                                                       | Web-standard `Request`/`Response`; unchanged.                                                                                                                                                                                                                                                     | None                   |
| Rate limiting in SQLite                                             | `viewer/ratelimit.ts`                                                                          | Replace it with the **Rate Limiting binding**. This also saves D1 writes.                                                                                                                                                                                                                         | Small                  |
| Reading-time beacons, one `UPDATE` every few seconds                | `viewer/tracking.ts`                                                                           | Have the client send fewer beacons with more data in each, for example every 15 to 30 seconds and on page hide, to stay well within D1 write quotas.                                                                                                                                              | Small                  |
| `OPENROOM_SECRET_KEY` in `.env`, rotation through `_PREVIOUS`       | `secrets.ts`                                                                                   | A Worker secret entered in the Deploy form, with rotation kept the same way. The secret stays outside D1, so a database export on its own cannot decrypt saved credentials.                                                                                                                        | Small                  |

## The one-button deploy

The README gets a `[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/anectico/openroom)` badge. Cloudflare reads `wrangler.jsonc` and then:

1. Forks the repository into the owner's GitHub and connects **Workers Builds**, so every push to the fork deploys.
2. Creates:
   - the **D1 database** (`openroom`);
   - the **R2 bucket** (`openroom-files`);
   - the **queue**;
   - the **`send_email`** binding;
   - a **Cron Trigger**;
   - and, if used, the Images and Rate Limiting bindings.
3. Asks for the secrets listed in `.dev.vars.example`: `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `OPENROOM_SECRET_KEY`. The form text explains how to generate a key and that it must be saved somewhere safe.
4. Runs the build command, which includes `wrangler d1 migrations apply openroom --remote`, then deploys to `openroom.<account>.workers.dev`.
5. On the first request, the app creates the owner, as `seed.ts` does today. The setup card then guides the owner to:
   - add a custom domain;
   - set up an email sending domain under **Email Service → Email Sending**;
   - remove `ADMIN_PASSWORD`.

**Updates:** a **Sync fork** on GitHub, or an optional GitHub Action in the fork that opens a PR when upstream tags a release. Workers Builds then applies migrations and deploys. **Rollback** uses Workers versions in the dashboard; it rolls back code, not the database. Migrations must therefore stay additive, which is already the rule. A bad migration is recovered with D1 Time Travel.

**To verify in the spike:**

- the Deploy button on a fresh account, including D1, R2, Queues, and the new `send_email` binding;
- whether Queues are available on the free plan; if not, use the cron fallback;
- how a migration step in the build command behaves on the first deploy, before the database exists.

## What changes for users

- **Gained:**
  - setup in about two minutes with no server;
  - HTTPS, DDoS protection and a global edge;
  - backups by default instead of a warning that the replica shares the server;
  - the data can be browsed in the dashboard;
  - email works without a third-party account;
  - typical cost is $0 to $5 a month, compared with a VPS at €5 to €20 plus storage.
- **Lost:**
  - "self-hosted on any server" becomes "deployed to your own Cloudflare account". The data is still in the owner's account and nobody else's, but Cloudflare becomes a dependency;
  - SMTP;
  - local-disk storage;
  - the `openroom-server` CLI. The `openroom` API CLI stays.
- **Limits:**
  - free plan: email to investors does not work, CPU and D1 write quotas are tight, and Time Travel goes back only 7 days;
  - a D1 database holds up to 10 GB, which is ample for metadata. Documents live in R2, whose free allowance is 10 GB-month.

## Keep the VPS version?

**Recommendation: retire it at a tag** such as `vps-final`, before the first public release. The VPS image has never been published (the README calls it an "initial release candidate"), so no installed users are affected. After the async conversion, the domain code no longer fits `better-sqlite3`'s synchronous model. Keeping both would mean another async SQLite driver for Node and double the release checks for access, rendering and recovery.

## Phased plan

| Phase                               | Outcome                                                                                                                                                                                                               | Size      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **0. Spike (go/no-go)**             | `adapter-cloudflare` builds. Migrations applied to D1. Sign in with Better Auth on D1, one room, one PDF from R2 with a range request. The Deploy button tested on a fresh account, including D1, R2, Queues and `send_email`. | 2–3 days  |
| **1. Async database**               | The async shim, every query awaited, transactions rewritten as batches, Better Auth on D1. Remove the launcher, Litestream and the custom Node server.                                                                   | 1.5–2 weeks |
| **2. Files**                        | R2-only storage. Chunked multipart uploads from the browser. Document serving with ranges. Images binding or canvas re-encoding for branding. Page counts in the browser.                                               | ~1 week   |
| **3. Jobs, email, exports, backups** | Jobs on Queues and cron. Email through the `send_email` binding, Resend kept. Streaming zip to R2. Nightly `.sql` export to R2. Beacons batched to save D1 writes. Rate Limiting binding.                                | ~1 week   |
| **4. One-button deploy and docs**   | `wrangler.jsonc` and `.dev.vars.example`, the README badge, setup card steps, rewritten configuration, email, storage and operations guides and agent runbooks. CI gets `wrangler deploy --dry-run`. Remove `deploy/` and the Dockerfile. | 3–4 days  |
| **5. Release checks**               | Run the access, rendering and recovery drills from the release guide against a real Cloudflare account, including a Time Travel restore. Measure CPU per route and D1 rows written per investor-hour on the free plan.   | 2–3 days  |

**Total:** about 5–6 weeks of focused work, about one week more than a Durable Object would take because of the async conversion. The plan still removes more code than it adds: the launcher, replica, restore, storage moves, disk-space checks, Caddy and the installer.

## Decisions needed

1. **Go Cloudflare-only and retire the VPS at a tag?** Recommended.
2. **Document Workers Paid ($5/month) as the supported plan for real rooms, with Free as a demo or trial?** Recommended, because investor email requires Paid.
3. **Keep Resend as a second email option?** Recommended: yes. **Drop SMTP?** Recommended: yes.

## Sources

Checked 26 November 2026.

- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Email Sending on Workers Free: verified recipients only](https://runtimewire.com/article/cloudflare-brings-email-sending-to-workers-free-plan-for-verified-recipients)
- [Cloudflare announcement](https://x.com/CloudflareDev/status/2125564566755291247)
- [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Deploy buttons with secrets](https://developers.cloudflare.com/changelog/post/2025-07-01-workers-deploy-button-supports-environment-variables-and-secrets/)
- [Wrangler configuration and automatic provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
