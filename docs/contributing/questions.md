# Questions and FAQ

An investor asks about a file (and, for PDFs, the page they are on) from the viewer, or replies in a
thread under "My questions" (`/v/<link id>/questions`). A member answers from the room's Questions
tab or with `reply_to_conversation`; the answer is emailed when the investor has a verified session
in the room and email is set up.

- Threads are private to their investor. A verified session sees all of that investor's threads in
  the room; an unverified session sees only the threads it started, and is told answers won't be
  emailed.
- Investor text is plain text everywhere, and marked as untrusted in the API and MCP results.
- 20 questions or replies an hour per session; 5,000 characters each; previews cannot ask.
- New questions and investor replies create a `question` notice.

FAQ entries are written by members (never copied from a question as is: "Make an FAQ entry" opens an
empty editor with the thread beside it), rendered as Markdown with HTML off, shown to every investor
below the files, and can be reordered, edited and deleted.

A verified session sees only the threads its investor started from verified sessions, so someone who
typed that email on a link without verification never writes into, or reads from, the investor's
threads, and the answer email goes only to threads started by a verified session. The admin pages mark
threads from unverified sessions "Unverified".

## Investor question entry

My questions includes a room-level composer with optional document context from the current
permission-filtered tree. It uses the existing `/v/<linkId>/ask` endpoint. A supplied inaccessible
or invalid file ID is rejected rather than silently creating a general question. Access and origin
checks still apply; member previews cannot submit. Failed requests preserve the draft. After a
successful response the composer records the returned conversation ID before navigation, so a
navigation failure can reopen the conversation without submitting it again.

The list derives Awaiting answer/Replied from `conversations.last_author`. These labels indicate
who replied last and do not claim the investor has read a message. Existing verified-viewer and
unverified-session conversation boundaries remain unchanged.

## Investor unread replies

My questions shows an unread reply total and per-conversation counts, separate from the last-author
Awaiting answer/Replied state. `message_reads` records exact member message IDs scoped to the verified
investor, or to the original unverified session. Reading a conversation with GET does not change state.
The page observes visible replies and posts their IDs to its `/read` endpoint after a short delay,
only while the tab is visible. The endpoint checks same origin, current session, NDA and conversation
access, and inserts only member replies from that conversation. It cannot mark a concurrent new reply
that was not submitted. Focus refreshes counts; no email is sent and no read receipt is shown to owners.

## Conversation follow-through

Document references include the conversation's page destination. The reader rechecks access and
clamps that page against the current PDF; the reference is not a historical-version attachment.
Timestamps display local date/time, with exact ISO time in the title. Replies keep drafts in
sessionStorage under the session's hashed reading namespace and conversation ID, capped at 5,000
characters. Drafts survive navigation and reload within that tab, clear after confirmed success and
on sign-out, and are not a server-side or cross-device draft feature. Storage failure is disclosed.
Sending disables repeat submission; failures retain the draft. An uncertain network result asks the
investor to check the conversation before retrying, because delivery may already have occurred.

Conversation text wraps long URLs and unbroken strings as plain text. List previews are clamped to
three lines. Sticky shortcuts scroll/focus unread messages, the latest message or the reply composer;
they do not auto-scroll on entry or mark unseen replies read. The initial unread boundary remains a
New replies divider during the visit, while the existing visibility-based read endpoint stays in use.
The composer reports draft presence to show Resume draft. Current-version page links are labeled.
