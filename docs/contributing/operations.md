# Operations and members

Every owner action is one operation in `src/lib/operations/`. The REST API, the OpenAPI document and
MCP and the CLI are generated from the registry in `src/lib/operations/index.ts`; admin pages
call the same operations.

## Declaring an operation

`defineOperation` takes:

- `name` (snake case, also the MCP tool and OpenAPI `operationId`) and a one-line `summary` written for
  an agent;
- `role`, the lowest role allowed (`observer` < `admin` < `owner`);
- `http`, the REST method and path, with `{param}` path parameters merged into the input;
- `input` and `output` Zod schemas (GET inputs come from the query string, so numbers use
  `z.coerce` and booleans `z.stringbool`);
- `destructive`, for actions that need `confirm: true`: it returns the sentence that says exactly what
  would change, which the caller gets as a 409 `confirmation_required` answer first;
- `audit`, the target and an allow list of detail fields. Never put emails, names, labels or tokens in
  the detail. Every operation that is not a GET must have one; the registry refuses to load otherwise.

`execute()` checks the role, validates the input, asks for confirmation, runs the operation, validates
the output and writes the audit entry. Throw `OpError(status, code, message)` for expected failures.
Authorization reads the current member and API-key state again when execution begins. Operations
that prepare credentials, links, logos, uploads or storage asynchronously also recheck authorization
before saving their result. A canceled invite or removed member cannot regain a pending credential.

## REST

`/api/v1/<path>` takes `Authorization: Bearer <API key>` and JSON bodies with
`Content-Type: application/json`. Errors are `{ "error": { "code", "message" } }`. The OpenAPI
document is at `/api/v1/openapi.json`.
OpenAPI preserves alternative request bodies, including each email provider's fields. The admin
operation endpoint rejects malformed JSON, null, arrays and other non-object bodies with 400.

## Members and sign-in

Better Auth (`src/lib/server/auth.ts`) holds members, sessions, passwords and API keys:

- Public sign-up is off. Members are created by the owner seed (`ADMIN_EMAIL`) and by `invite_member`,
  through Better Auth's internal adapter; the invite is a one-time `reset-password:` verification
  value valid 7 days, opened at `/admin/invite/<token>`.
- Better Auth routes that would change members or keys outside our operations are disabled
  (`disabledPaths`), and the role is our own `user.role` column, which no Better Auth route can set.
- An API key is checked only on `/api/v1/` and `/mcp`; it is never a session on other
  routes. Its role is read from its member on every request, so a role change or removal applies at
  once.
- Removing a member keeps the `user` row as a tombstone (`removed-<id>@invalid`, the real email only
  as an HMAC) and deletes their sessions, password, keys and pending links.
- Password resets, invite acceptance and password changes are written to the audit log.
- Rate limits read the client IP from `x-openroom-ip`, which our server sets on every request from
  `ADDRESS_HEADER`/`XFF_DEPTH` or the socket, overwriting anything the client sent.

On the server, `openroom-server reset-password <email>` prints a one-time link (valid 24 hours) and
`openroom-server create-api-key <email>` prints a new key, so an agent can start without the admin
pages.

## The audit log

`audit_log` is insert only: triggers reject `UPDATE` and `DELETE`. It has no foreign keys, so deleting
rooms or removing members never touches it.

## Rooms, folders and files

Folders and files share one order per parent; `roomTree()` numbers them depth first (1, 1.1, 1.2), and
`place()` rewrites the positions of a parent's children after every move. A file's `kind` (`pdf`,
`image`, `video` or `download`) comes from its current version's content type, which is detected from
the bytes, never from the name; SVG and anything unknown are download-only.

Stored objects are reference counted in `objects`. Deleting a file, folder or room releases its
versions' objects (refcount 0 and `released_at`); the stored bytes stay until the clean-up after the
retention window, so a restored database still finds its files. A frozen room refuses every change.

## Uploads

1. `create_upload` checks the role, the target room, the size limit (5 GB by default, setting
   `uploads.max_bytes`) and free disk space, and returns a one-time URL, valid 24 hours.
2. The client sends the whole file to that URL as one `PUT` with
   `Content-Type: application/octet-stream`. Our server handles `/upload/` before SvelteKit, so the
   1 MB body limit never applies; it counts the bytes, hashes them and writes straight to the final
   key under `storage/files/`. One `PUT` at a time per upload; a failed one is sent again from the
   start. In `npm run dev` the same handler runs as a SvelteKit route.
3. `finish_upload` compares the SHA-256 with the one given (if any), detects the type and creates the
   file or the new version.

Finishing must happen before the upload expires. A checksum supplied at creation remains binding;
an additional checksum at finish must agree too. File-request uploads have the same expiry rule.

The `uploads.cleanup` job removes expired, unfinished uploads and their partial files every hour.

## Links and blocks

A link's address is `/r/<token>` with a 256-bit token, stored as a SHA-256 hash for lookup and
encrypted for members to copy; `new_link_address` replaces it and kills the old one. Link operations
need the admin role, because an address is a way in, so observers never get one.

A link stores only the settings it overrides; everything else follows the room's link defaults, so a
change to the defaults reaches every link that does not override it. `resetSettings` stops
overriding. NDA can be required only once the room has NDA text.

Allow and block entries are emails or domains (`fund.com`, `@fund.com`), normalised to lower case and
punycode; a domain also covers its subdomains. Block entries for emails are stored as an HMAC, with
the email kept only for display, so a block keeps working after the investor is erased and can still
be removed by typing the email. The install-wide list (`add_blocks`, `remove_block`) applies to
every room; per-link blocks are set with the link.

Revoking is final. `revoke_all_links` revokes every link of a room and needs `confirm: true`.

## Email

`src/lib/server/email.ts` sends through Resend or SMTP (Nodemailer). The configuration comes from the
environment (`EMAIL_FROM` with `RESEND_API_KEY` or `SMTP_*`) or, when those are not set, from the
settings table, where the API key and SMTP password are encrypted and never returned. Every email
goes through the `email.send` job, which retries five times; the job's payload is cleared when it
finishes. A daily cap (90 by default, a general setting) counts `email.send` jobs of the last
24 hours. All email text lives in `src/lib/server/email-copy.ts`.

Emails sent today: member invites (`invite_member` and `resend_invite` with `sendEmail`, on by
default; the link is always returned too) and password resets from the sign-in page, which answer the
same way whether or not the email is a member. `test_email` sends at once and reports the provider's
answer.

## Admin pages

The pages under `src/routes/admin/` load data with `runOp()` (`src/lib/server/http/admin.ts`) and
change it through `POST /admin/api/<operation>` with JSON, the same operations as the REST API, run as
the signed-in member. `src/lib/admin/op.ts` holds the client helpers; `DangerAction.svelte` shows the
server's own description of a destructive change before confirming it; uploads run through the queue
in `src/lib/admin/uploads.svelte.ts` (one file at a time, progress, retry, whole folders).

Dropped native directories are read to completion, including repeated directory-reader batches and
empty folders. The destination is the folder selected when dropping. Picker uploads use relative
file paths; both paths call the same folder and upload operations and skip hidden entries.

`get_viewer` returns per-file `versions` with page timing and watched video ranges across that
investor's sessions. The same output schema drives the admin drill-down, REST, MCP and generated CLI.
Room activity version lists respect time/link/group filters; video coverage counts distinct viewers
instead of visits. File deletion removes that file's live activity with its versions.

## Duplicating a room and the index

`duplicate_room` copies folders, files (new rows pointing at the same stored objects, whose reference
counts go up, so nothing is copied on disk and deleting either room keeps the other's files), groups
with their permissions, link defaults, the current NDA text and branding. It never copies links,
investors, activity, questions, FAQ or file requests.

`export_room_index` writes the numbered index of folders and files as CSV (cells that start with a
formula character are escaped) or PDF (the standard Helvetica font, so letters outside Latin-1 show
as `?`), kept 24 hours like other exports.

## Freeze and archive

`freeze_room` (admin, with confirmation) revokes every link, closes open file requests and makes the
room read only for good; only its retention (`set_room_retention`, 2 years by default) and deletion
still work. The `export.archive` job then builds a zip under `exports/archive/<room>/<time>.zip`:
`files/` with every current version numbered as in the room, `index.pdf` and `index.csv`,
`audit-log.csv`, `questions.csv`, `faq.md`, `activity/*.csv`, `nda-acceptances.csv`, a README and
`manifest.sha256` (`sha256sum -c manifest.sha256` checks every entry). Members download it from the
room's banner, `/admin/rooms/<room>/archive`, or `/api/v1/rooms/<room>/archive/download` with a key.
If the build fails (for example, the disk is full), `retry_room_archive` or the banner's "Try again"
builds it again. Deleting a room expires its exports and archive at once.

When the retention period ends, the daily retention job deletes the room's reads and events and the
archive; NDA acceptances stay.
