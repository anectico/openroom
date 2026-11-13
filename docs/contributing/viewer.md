# Viewer, downloads and zips

## Viewing

`/v/<link id>/view/<file id>` opens one file the link's group allows, with previous and next file.
The browser loads the bytes from `/v/<link id>/files/<file id>`, which re-checks the session on
every request and serves byte ranges.

- **PDF**: pdf.js (`src/lib/viewer/PdfViewer.svelte`) loads the file in 1 MB ranges and renders
  pages to canvas only as they come near the screen and frees pages far from it, with each page's
  canvas capped at 16 megapixels, so long decks don't exhaust the browser's memory. Page X of Y, jump to page, zoom, and the arrow
  and Page Up/Down keys. The page fits the width again when the window is resized. The current page is the one taking up
  the most of the window, recomputed on scroll; at the very end of the document it is the last page. "Ask about page
  N" sits in the sticky toolbar and keeps the page it was opened on. Its character maps, standard fonts and WebAssembly decoders come from
  `/pdfjs/...`, served from the installed `pdfjs-dist` package; the CSP allows
  `wasm-unsafe-eval` for those decoders and nothing else.
- **Images** show at their natural size, shrunk to fit, with zoom.
- **Video** plays in our own player (`src/lib/viewer/VideoPlayer.svelte`): play, seek, time,
  mute, volume and Full screen, with Space, arrows, M and F on its toolbar. The browser's own
  controls are never shown, because their full screen, picture-in-picture and AirPlay would show the
  video without the watermark; our Full screen puts the player and its watermark in full screen
  together. Safari's presentation-mode events are still caught and sent back inline, as a safety net.
- PDF pages include a selectable text layer. Find and page thumbnails provide additional navigation.
  Modified arrow keys remain available to the browser.
- **Download-only files** show a card with a Download button.

The server counts a PDF's pages after upload (`files.pages` job, up to 100 MB) and stores them on
the version.

## Watermark and protection

When the link uses a watermark, every page, image and video carries a repeated overlay with the
investor's email, IP and the UTC time the page was opened (members' previews say "Preview"), dark
with a light outline so it shows on light and dark content.
Screenshot protection blurs the document when the window loses focus or the tab is hidden, hides it
when printing, and blocks the context menu and dragging. Both are best effort: the original can
still be saved from the browser's developer tools, and anyone can photograph the screen; the
watermark is what identifies a leak.

## Downloads

| Link setting                 | Single files             | Zip |
| ---------------------------- | ------------------------ | --- |
| No downloads                 | only download-only files | no  |
| Each file                    | yes                      | no  |
| All allowed files as one zip | only download-only files | yes |

A zip is built by the `export.zip` job from the files the session's link may see, with folders and
names numbered as in the room (file extensions are kept only when they are plain letters and
digits), stored under `storage/exports/` and kept 24 hours. Each zip records a fingerprint of the
files it holds; a download is refused with "the room changed" when that no longer matches what the
link may see, and a ready zip with the same fingerprint is shared by every session of the link.
At most 2 zips build at once per link (or per room for members) and 5 in total, and each IP may
start 10 an hour. Zips and page counts run in their own job lane, so they never delay emails. Investors see
preparation progress, then an explicit Download zip action. `DownloadRoom.svelte` handles start and
poll failures, times out individual requests after 15 seconds, and retries an interrupted poll against
the same export ID. Failed or missing jobs can be recreated. Unmount cancels polling and in-flight
requests; the server job may still complete. Download authorization remains server-side. Members download a whole room with
`export_room_zip` (Files tab: "Download the whole room"); the API downloads it from
`/api/v1/exports/<id>/download` with the same key. Members open or download any single file, and
any version, from the Files tab.

## Navigation and reading continuity

The document list uses shallow URL state (`q`, `folder`, `expanded`, `changed`) and reads SvelteKit 3's
`page.shallow.url` when present. Reader links carry a bounded return scroll offset (`y`). Return URLs
are constructed from an allowlist of parameters on this room's route, never an arbitrary destination.
Search and folder results still use the server's permission-filtered tree.

`guide=1` selects the room's ordered visible pins for reader Previous/Next navigation when the
current file belongs to that list. Every reader load rechecks the session and permissions. If a
file is no longer pinned, normal document navigation applies; inaccessible files are refused.

The PDF component stores at most 50 file/version/page entries in `sessionStorage`, under a hash
namespace derived from the current session. This namespace is not an authorization credential.
It saves no document bytes or titles. Continue reading intersects stored entries with current visible
files and versions. A new version starts fresh; unavailable entries cannot produce a card. Storage
errors and malformed entries are ignored. Member previews do not write progress. Existing reading
analytics and access checks remain independent. Tab-local reading continuity itself requires no migration.

## Returning visits and PDF tools

Migration `0013_investor_attention` adds `investor_visits` and `message_reads`. The document list
stores a snapshot of visible file IDs and versions for each link and verified investor, or each
unverified session. The first visit has no change badges. After 30 minutes away from the document
list, or a new verified session, the last snapshot becomes the comparison baseline. Reloads within
the visit retain that baseline. New documents use creation time; Updated compares current versions.
Renames and moves alone are not updates. Older files newly granted to a group are not marked New.
Counts and the `changed=1` filter use only the current permission-filtered tree. Member previews
neither read nor write investor visit history. These records participate in investor export and erasure.

PDF Find searches extracted document text, without an outside service. It returns matching pages,
with Previous/Next result controls and highlights on rendered text spans. It searches sequentially,
caches at most 200 page strings, caps results at 500 matching pages, and supports cancellation.
Image-only PDFs explain that OCR is unavailable. Page thumbnails render eight at a time and cancel
work when removed. Ctrl/Cmd+F opens document Find when focus is outside a form control or dialog.

Rendered PDF pages include pdf.js text layers for selection and assistive technology. Text follows
zoom and is released with distant canvases. This exposes PDF text in its supplied order; it does not
repair missing text or guarantee tagged-document reading order. Search excerpts and highlights never
insert document strings as HTML. Watermarks remain over the document. Text selection is available;
screenshot protection remains best effort, not copy protection.

## Follow-through and explicit reviews

The home action summary combines changed documents, unread replies and requests needing action.
First visits hide the change filter. Welcomes begin collapsed with a plain-text two-line excerpt and Read full welcome;
explicit disclosure choices persist by session/link and content revision. A changed note starts fresh.
Continue reading appears before the note and pinned documents.

The mobile PDF toolbar keeps navigation and primary actions in two rows; Zoom options contains
secondary controls. Find and Pages use a bounded, focus-trapped dialog, with thumbnail pagination
outside its scrolling grid. Search survives closing the dialog. The sticky matching-page navigator
keeps Previous/Next and the current result available; reopening Find shows the selected row.
Snippets emphasize matches and preserve word boundaries. Rendered text highlights use plain DOM text
nodes and marks for only matched ranges, including phrases across spans, never document HTML.
An authorized reader URL may include a positive `page` query; it takes precedence over tab resume
and is clamped to the document's page count. It grants no additional access.

Migration `0014_investor_reviews` adds `document_reviews`. Start here provides explicit Mark reviewed
and Undo actions, progress and a next-unreviewed link. Opening a document never marks it reviewed.
Each record binds to the current file version and the verified investor identity, or the unverified
session. A different current version is unreviewed. Only currently visible pinned files contribute to
progress. Preview does not read or write reviews. The review endpoint checks same origin, current
session, NDA, current visibility and pin membership; stale versions return 409. Identity-scoped state
may follow a verified investor across authorized links, but never grants access through another link.
Reviews participate in investor export and erasure. They are personal organization state, separate
from reading analytics and team approval, with no owner review-status dashboard.

## Completion and return polish

Welcome disclosure uses bound Svelte state so data invalidation cannot overwrite a collapsed choice.
Reviewed pins use a compact disclosure, while unreviewed pins preserve their original guide numbers.
Review actions return keyboard focus to the progress summary when a card moves between groups.
PDFs have an end-of-document completion panel using the same version-checked review endpoint and
permission-filtered Previous/Next context. Opening a file still never marks it reviewed.

`documentReviewStates` joins the investor's own review with current visible pinned file versions.
Only that scope's previous version, current version and current version timestamp reach the page;
preview receives no personal review metadata. No schema migration is required. Version explanations
are independent of the returning-visit comparison baseline, including during a first visit.

PDF tools store search and thumbnail-group scroll positions separately. Opening restores the panel
and reveals its selected item using the panel's own scroll offset, without moving the underlying
document. Thumbnail completion rechecks placement after canvas sizing; resizing also keeps selection
reachable. Existing dialog focus trapping, focus restoration and page-count limits remain.

## Investor visual hierarchy

Semantic attention, success and search-match tokens are independent of the room brand. RequestStatus
combines icon, text and Badge variants; review completion separates the status from Undo. Home pins
use one column through tablet widths and three columns at xl, with full-width version explanations.
Conversation unread dividers sit outside message articles; the article retains data-message-id for
read tracking. Request history excludes the latest receipt by id and uses LocalTime consistently.
PDF thumbnails have an explicit current-page check and label; search-match tokens distinguish text
matches from the selected row. No access, operation, schema or review-persistence rules change.

`PinnedDocument`, `DocumentListItem` and `RoomNavigation` share presentation between real investor
pages and appearance samples. Keep permission filtering and review writes in their existing owning
loaders/actions. Pin controls move below the title when the card is narrow. File metadata includes
format, size and a labeled outline section at every width. Excerpts decode rendered Markdown to plain
text and render through Svelte escaping; full notes still use the existing sanitized renderer.
