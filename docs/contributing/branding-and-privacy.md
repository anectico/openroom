# Branding, webhooks and investor data

## Branding

Branding is set for the install (Settings → General and email, owner only) and can be overridden per
room (room Settings). Operations: `get_branding`, `update_branding`, `set_logo`.

- **Logo.** PNG, JPEG or WebP under 700 KB. The server re-encodes it with sharp to a PNG of at most
  512 px, so what investors load is never the uploaded bytes; SVG is refused. Logos are stored as
  objects and served at `/b/logo/<key>` only while they are a current logo, with a sandboxing
  content security policy.
- **Accent colour.** A `#rrggbb` colour used for investor button fills. `src/lib/brand.ts` chooses
  black/white button text for contrast and derives darker navigation/focus colours for light surfaces.
- **Browser icon.** The effective logo's existing public endpoint accepts `?icon=1`, returning a
  64×64 PNG with transparent padding. It checks that the key is a current logo before reading it.
  Admin pages retain the built-in icon; rooms without logos fall back to it.
- **White-labelling.** Install-wide: hides "Powered by OpenRoom" on investor pages.

The investor gate (`/r/<token>`), the room pages (`/v/...`) and the error page use the room's logo and
colour, falling back to the install's. The error pages under `/r` and `/v` ("This link is not
available", "Your session has ended") cannot know the room, so they show the install's logo and honour
white-labelling.

The Appearance editor stages edits and previews them locally with the same Markdown renderer and
brand-colour helper used by investor pages. It saves through `update_branding`, which accepts
optional `imageBase64`, `accentColor`, `name`, `welcomeMarkdown` and workspace-only `whiteLabel`.
Name/welcome are room-only. Omitted fields stay unchanged; null logo/colour restores inheritance.
`get_branding` includes `workspace` defaults and `roomOverrides` to explain effective values.
`set_logo` and `update_room` remain supported for existing callers.

Image storage finishes before a synchronous transaction updates appearance. The transaction rechecks
membership and frozen-room state after the asynchronous work. Replaced logo references are released
in the same transaction; an uncommitted new object is released on failure and follows normal retention.
No database migration is required. The audit records field names, never image payloads.

Welcome Markdown is rendered through `src/lib/markdown.ts` (`html: false` and HTTPS/mailto links),
re-exported by the server module. It appears at email entry and in the authenticated room. The shared
`RoomWelcome` component starts rendered introductions of 900 or more characters collapsed.
No new investor access rules are introduced. Room duplication preserves the existing appearance fields.

## Link welcomes and pinned documents

Migration `0012_investor_welcome_and_pins` adds nullable `links.welcome_markdown` and the ordered
`room_pins` table. Existing links use the room introduction and existing rooms start without pins.
The appearance changes described above remain separate from this additive migration.

`create_link` and `update_link` share the `personalWelcome` input schema: trim, a 4,000-character
limit and blank-to-null normalization. The owner editor previews the shared Markdown renderer.
The investor page resolves the link note only after `requireViewer`, so entry/password/email/NDA
pages do not receive it. The general room introduction still appears on entry. Link creation audits
record whether a note exists; updates record the field name, not its content.

`set_pinned_documents` runs in the operation transaction and validates all IDs against the room
before replacing its list. Owners/admins can edit writable rooms; current membership is rechecked.
`get_room` exposes ordered IDs to members. Investor loading intersects pins with the already
permission-filtered tree and returns no hidden pin IDs or titles. Opening or downloading still
uses the existing access-checked routes. Deletion cascades through the file foreign key; duplication
maps pins to copied files and does not copy links. The shared schemas generate REST, MCP, OpenAPI
and CLI access. See the [verification record](../reviews/2026-11-13-personal-welcome-and-pins.md).

## Webhooks

Owners add webhooks in Settings → Webhooks (`create_webhook`, `update_webhook`, `delete_webhook`,
`test_webhook`, `list_webhooks`). A webhook gets every notice, or only the events picked:
`first_open`, `visit`, `nda_accepted`, `read_past`, `download`, `question`, `request_upload`,
`room_frozen`, `archive_ready`, `email_cap`, `disk_low`, `replication_stopped`.

Two formats:

- **generic** posts JSON: `event`, `text`, `roomId`, `roomName`, `investorEmail`, `fileId`,
  `noticeId`, `at`.
- **slack** posts `{ "text": "..." }`, which Slack incoming webhooks and most chat tools accept.

Every request carries `x-openroom-event`, `x-openroom-timestamp` (Unix seconds) and
`x-openroom-signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<raw body>` with the webhook's
secret. The secret is shown once, when the webhook is created. To verify, recompute the HMAC over the
raw body, compare in constant time and refuse timestamps older than five minutes.

Deliveries are background jobs in their own lane, so a slow receiver never delays verification
emails, retried up to six times with backoff. The address is stored encrypted (it can carry a
token, as Slack's do); only its host is shown. The last status and error show on
the settings page.

Outgoing requests go through `src/lib/server/outbound.ts`: HTTPS only, no credentials in the address,
no internal names, and no private, loopback, link-local or carrier-grade NAT addresses (IPv4, IPv6,
IPv4-mapped and NAT64), checked again when the connection is made so DNS cannot point a name inside
later. Redirects are not followed, each request has 10 seconds in all and responses are cut at 64 KB.

## Investor data export

For a data access request, an admin opens the investor (Investors → the investor) and picks "Export
their data" (`export_viewer_data`, `POST /api/v1/viewers/{viewerId}/export`). The JSON file holds the
investor's visits with their answers, NDA acceptances, page and video reads, events, questions with
their threads, and file-request uploads (names and sizes, not the files). It never holds token hashes,
codes or secrets. The download is valid for 24 hours and the export is in the audit log.

## Investor erasure

`erase_viewer` (`DELETE /api/v1/viewers/{viewerId}`) is available to admins and owners with explicit
confirmation. The live-record transaction, session-owned data, queued work, archive invalidation
and retained evidence are described in [investor data](../privacy.md). Pending uploads and export
completion recheck their records after asynchronous work, so erasure cannot resurrect them.
Backups and released object bytes remain separate. Daily released-object cleanup and the weekly stray sweep enforce the recovery grace period; they never delete database replica prefixes.

## Key rotation

See [configuration](../configuration.md#rotating-the-secret-key). The code is in
`src/lib/server/rotation.ts`: at start it walks `settings.value_enc`, `links.token_enc`,
`webhooks.secret_enc` and `webhooks.url_enc` in one transaction and re-encrypts values that only the previous key opens.

Investor exports also include visible document ID/version snapshots with visit timestamps and exact
reply read markers. Erasure removes both `investor_visits` and `message_reads`, including rows owned
by unverified sessions, before removing sessions. They contain no authorization credentials.

`document_reviews` adds explicit version-bound checklist state to exports and erasure, including
session-owned records. Browser-local reply drafts and welcome disclosure choices are not server
records; their lifecycle and erasure limits are documented in [privacy](../privacy.md).
