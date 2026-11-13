# File requests

A member asks for a file from one investor who entered the room, everyone on a link, or everyone in a
group (`create_file_request`), with an optional due date and a size limit (at most the install's
upload limit). Verified investors in the target are emailed the request when email is set up; others
see it at the top of the room.

Investors upload on `/v/<link id>/requests/<id>` through the same streaming upload URLs as members:
the upload row belongs to the investor's session, and the URL stops working when the session ends.
The type is detected from the content. Uploads after the due date are accepted and marked late; a
closed request moves to history and refuses uploads; an investor who still has it open is told it is closed and the drop zone is disabled.

Uploads are never part of the room's folders: only members see them, always as downloads
(`/admin/rooms/<room>/requests/uploads/<id>`, or `/api/v1/request-uploads/<id>/download` with a key).
A verified session sees all of its investor's uploads for a request; an unverified one only its
own. Each upload creates a `request_upload` notice. 40 upload calls an hour per session.

A request for one investor is shown only to that investor's verified sessions, and only investors who
entered the room with a verified email can be picked. Uploads from unverified sessions are not tied to
an investor.
New uploads honor the current install limit as well as the request's saved limit. Uploads must be
finished before their URL expires. Request emails choose an active link that still allows the
recipient, including current allow and block rules, and send at most once per investor.

## Investor request status and receipts

The investor list includes currently authorized closed requests as history. Action needed means an
open request with no submission from this identity; Uploaded means at least one own submission;
Closed takes precedence. These are receipt states, not review or approval. Verified investors see
their verified submissions across sessions; unverified visitors see only their own session's uploads.
Successful submission returns an upload timestamp and displays a receipt with filename, size and late
status. The submission list survives reload. Switching requests clears transient upload state.

Only read paths opt into closed requests. Start, byte upload and completion continue to check current
access and an open request, including closure during upload. Closed history never expands the request's
link, group or verified-viewer audience.

Requests has its own investor navigation destination and badge for Action needed items. The list
sorts these first, then by due date (undated last), then title. Uploaded and Closed items live in a
Submissions & history disclosure. Uploaded still permits additional submissions while open. Relative
deadlines use the browser's local calendar, with the exact date available on the time element.
Closed requests without submissions explicitly say so instead of referring to nonexistent history.

The request page leads with the latest own receipt, using a newly completed upload or the server's
existing own-submission list after reload. Additional uploads use a smaller Add another file action;
closed requests never expose it. Return links use a `submitted` request ID only as a presentation
hint. The requests loader validates current request access and requires an own submission before
showing the recent-submission summary or expanding history. A forged ID cannot claim a receipt or
expose another investor's submissions. Upload authorization and storage paths are unchanged.
