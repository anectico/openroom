# Investor data

Admins can open an investor profile and choose **Export their data** for a JSON export of their
sessions, answers, NDA acceptances, reads, events, private question threads and file-request upload
metadata. Session-owned questions and uploads are included even when their row has no verified
viewer ID. The export excludes tokens, verification codes, credentials and file contents. It expires
after 24 hours and is audited.

## Erase an investor

From the same profile, choose **Erase investor data** and review the confirmation. The operation
`erase_viewer` also exists as `DELETE /api/v1/viewers/{viewerId}` with `{ "confirm": true }`.
It requires an admin or owner; a request without confirmation describes the effect and performs no
mutation.

The transaction ends and clears their viewer sessions, removes answers, activity, reading records,
notices, private conversations, file-request records and matching explicit email allow-list entries,
and cancels related queued work. It clears their email and name, invalidates their data exports and
affected CSV/archive exports, and queues fresh archives for frozen rooms. Other investors' sessions,
messages and files remain intact. Pending uploads and stale background export results cannot attach
themselves after the transaction finishes; byte cleanup is retried as a durable job.

Some evidence is deliberately retained:

- Existing NDA acceptance records retain the agreement evidence and the accepted name and email.
- Existing email blocks keep their keyed hash so a blocked investor cannot regain access by asking
  for erasure. Their display address is removed. Unblock by typing the email on the Investors page.
- The audit record retains who performed erasure, when and the investor ID.
- Database backups, rollback snapshots, downloaded copies and released document objects are separate
  from live application records. Released bytes remain retained for recovery. Automatic object
  cleanup retains released files for at least 30 days and unknown files for 30 days after first sight; this operation does not promise physical deletion from every backup or
  stored object on a deadline.

Erasure removes current access, but is not a new permanent block. A person may enter again through
a still-valid open or domain-allowed link unless an existing block applies. Restore from an older
backup can also restore older personal data. Reconcile erasure requests before making such a
recovered installation available to investors.

## Reading position in the browser

The investor PDF reader keeps up to 50 file IDs, version numbers and page positions in the current
tab's session storage. It stores no document contents, titles or email addresses there. The key is
scoped to the investor session; a different session does not reuse these positions. Continue reading
checks current permissions and versions before showing a saved file. Tab storage is separate from
server reading analytics, expires with the browser's tab session, and may be cleared through browser
site-data controls. It is not synchronized across devices or included in server data exports.

The investor experience also stores visible document ID/version snapshots and timestamps to identify
changes since a previous visit, plus message IDs and timestamps for unread reply indicators. These
are scoped to the verified investor or an unverified session. Investor data exports include both;
erasure removes their live records with the investor's sessions. Existing backup retention exceptions
still apply. PDF search runs in the browser and does not send search terms to an external service.

Explicit Start here reviews store a file ID, current version and review timestamp. They belong to the
verified investor identity or unverified session and are included in data export and live erasure.
Opening a file does not create a review record. The checklist does not expose a new owner read receipt.

Conversation reply drafts contain the text you type and stay in the tab's session storage, scoped to
the session and conversation. They clear after confirmed submission or sign-out; they are not included
in server exports or remotely removed by server erasure. Welcome disclosure choices store only a
content revision and optional open/closed choice in the same tab. Browser site-data controls can clear
these local records; a new investor session uses a different namespace.
