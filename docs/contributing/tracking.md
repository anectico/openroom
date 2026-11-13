# Tracking, activity and notifications

## What is recorded

The viewer counts time per page while the tab is visible and sends it as JSON with a `keepalive`
`fetch` (falling back to `navigator.sendBeacon`) to `/v/<link id>/beacon` on page change, when the tab is hidden or closed, and
every 30 seconds. Videos send the ranges the browser reports as played. The beacon route accepts
only a same-origin request with the session cookie, 120 a minute per session. Same-origin means a
matching `Origin` header or, when a browser leaves it out, `Sec-Fetch-Site: same-origin` or a
same-origin `Referer` (`sameOrigin` in `src/lib/server/viewer/http.ts`); the ask and file-request
routes use the same check. The body is sent as `application/json` because SvelteKit refuses
`text/plain` posts that carry no `Origin`, which Safari's beacons do.

The server (`src/lib/server/viewer/tracking.ts`):

- upserts one `page_reads` row per session, file version and page. Each session has one time budget:
  everything it reports, pages and video together, can never exceed the time since the session
  started plus 5 seconds, and one beacon carries 10 minutes at most;
- ignores files the link may not see, page numbers outside the file, and preview sessions;
- merges video ranges in `video_reads` and keeps the duration each session's browser reported, so a
  forged duration only affects that session's own numbers;
- writes `events`: `visit`, `file_open`, `download`, `zip_download`, `nda_accepted` and `read_past`
  (once per investor and version, when they spent at least a second on the room's "read past" share
  of the pages, or watched that share of a video).

Members' previews and members' own visits never create rows. A download is recorded once per
session and file in 10 minutes, whether or not the request carries a Range header; download routes
allow 120 requests a minute per session, and accepting the NDA again is refused when it is already
accepted.
Only successful GET downloads count: HEAD and unsatisfiable ranges do not produce download events.
Beacons recheck the viewer session after receiving the body. PDF and image pages and video ranges
must match the file's current media type. Video gaps remain unwatched, stored coverage stays within
the session's granted time, and page allocation cannot exceed its budget through rounding. The
read-past threshold adds the same investor's time across sessions for each page and version.

## Activity

`get_room_activity` returns a plain summary, then the room by investor (visits, files, time,
downloads, answers, last seen), by firm (email domain; free mail such as gmail.com is never a firm),
by file (viewers, average time, versions read, time per page, viewers per tenth of a video), a
timeline and who is viewing now (a beacon in the last minute, with the PDF or video the session read last). It filters by link, group and time.
The timeline names each event in words ("Asked about", "Uploaded a file for" and the request). The Activity tab exports each view as CSV, with cells starting with `=`, `+`, `-`, `@`, tab or return
prefixed so spreadsheets never run them. `list_viewers` and `get_viewer` cover investors across
rooms.
Link, group and time filters also apply to custom answers, versions read and the current-viewer
list; supplying both a link and group selects their intersection. Video tenths describe the current
version and count each investor once, including when that investor has several sessions. Current
viewers must still have access and satisfy the current NDA gate.

## Notifications

Notices are written for: first open of a link by an investor (or every visit on links with "notify me
on every view"), NDA accepted, file mostly read, file or zip downloaded, and the daily email cap. Each
member has their own read state. Email goes to every member who wants that event (owners and admins by
default, observers only when they switch it on), through the email queue and its cap; when the cap
is reached, owners get one email about it sent outside the cap. Notice emails may use at most 30%
of the daily cap, so verification codes, invites and resets always have room.

Deleting a room deletes its reads, events and notices; deleting a file deletes its reads and
events. NDA acceptances stay.

## Retention

A daily job removes IP addresses and user agents from sessions and uploads older than 12 months.
