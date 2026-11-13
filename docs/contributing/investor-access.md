# Investor access

How an investor gets from a link to the room, and how every later request is checked. The code is in
`src/lib/server/viewer/` and the routes under `src/routes/r/` and `src/routes/v/`.

## Gates

`/r/<token>` looks the link up by the SHA-256 of its token. An unknown, expired or revoked link, or
too many lookups from one IP, all show the same "link not available" page. Progress through the
gates is a `gate_progress` row behind a short-lived cookie (`og_<link id>`, 30 minutes); the raw link
token is never stored in it.

The steps, each skipped when the link doesn't use it:

1. **Password**: checked with Better Auth's password hash; 10 tries per link and IP (IPv6 per /64)
   per 15 minutes, and 100 per link an hour from all addresses together.
2. **Email**: normalised. An email that is not allowed, or is blocked, is refused with a clear message
   when verification is off; with verification on it continues to the code step exactly like an
   allowed email, but no code is sent and no code can match.
3. **Code**: six digits, valid 10 minutes, emailed through the jobs queue (`email.code`). Codes may
   use at most 60% of the daily email cap, so anonymous visitors can never starve invites and
   password resets. Limits: one send per minute per gate and email; 10 sends a day per email and IP,
   30 per email and 300 per link; 10 sends an hour per IP. Five tries per code; 20 a day per email
   and IP, 100 per email and 200 per link. Daily limits are counted per email and IP first, so a
   single address cannot lock an investor out; someone using many addresses can still reach the
   per-email and per-link ceilings for a day, which is the price of stopping code guessing. The
   limits come from `verification_codes` rows, so restarts don't reset them. IPv6 addresses count
   per /64.
   If email is turned off while a link requires verification, the link fails closed: every email,
   allowed or not, is told that codes can't be sent right now. New rooms start with verification on
   only when email is set up. The admin pages show this state in red and always allow turning
   verification off.
4. **Questions**: the link's custom fields.
5. **NDA**: name and acceptance, stored in `nda_acceptances` with the version, email, IP and time.
   The form carries the version shown; if a new version was published meanwhile, the investor is
   asked to read it first.

The last step creates the viewer (one per email, keyed by its HMAC), a `viewer_sessions` row and the
session cookie (`ov_<link id>`, 7 days), and redirects to `/v/<link id>`.

## Every request

`checkSession()` runs on every page and file request under `/v/<link id>`. It ends access at once when
the link is revoked or expired, the email left the allow list, or the email or its domain is blocked
for the link or the whole install. A new NDA version sends the investor to `/v/<link id>/nda` and back
to where they were.

## Groups

A link can belong to one group of its room. A group has a default for top-level items and explicit
`view` or `none` choices on folders and files; anything without its own choice inherits from its
folder, then from the default, so files added later follow their folder. A link without a group sees
the whole room. The investor's tree shows only visible items (and the folders that hold them), numbered
again so hidden items leave no gaps.

Link passwords need at least 8 characters. Provider error messages are stored and logged with
email addresses replaced by `<address>`.
Email and domain entries accept addresses, not URL paths, queries, fragments or recipient-list
syntax. Internationalized domains are normalized to ASCII. A verification code is bound to the
gate's current email; changing that email invalidates an in-flight verification for the old one.

Custom fields are set in the room's link defaults; a per-link override exists in the API
(`settings.customFields`) but not yet in the link editor.

## Files

`/v/<link id>/files/<file id>` streams the current version with Range support, `nosniff` and
`Content-Security-Policy: sandbox`, only when the file is visible to the link. Download rules are in
[viewer.md](viewer.md). The
viewer with watermark arrives in M3.

## Preview

`preview_link` gives a member a one-hour address that opens the room as that link sees it, with a
banner; preview sessions have no viewer and are never counted.

## Security headers

Every response sets `x-frame-options: DENY`, `x-content-type-options: nosniff`,
`cross-origin-opener-policy: same-origin`, a restrictive `permissions-policy` and
`referrer-policy: same-origin` (`src/hooks.server.ts`). The referrer policy keeps link tokens and room
addresses from reaching other sites while still letting browsers send a real `Origin` on our own
form posts; with `no-referrer`, browsers send `Origin: null` and SvelteKit's origin check refuses
plain forms such as the NDA and sign-out forms.
