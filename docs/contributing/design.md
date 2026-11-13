# UI design

The admin workspace keeps navigation and daily work separate. A fixed desktop sidebar holds the
workspace sections and recent rooms; a dialog exposes the same destinations, including Settings,
on a phone. The header gives location and account context. Warm neutral surfaces, a green primary
color, consistent spacing and the existing Inter/Lucide/shadcn-svelte system carry through the app.

## Main flows

- **Overview:** rooms and recent investor activity are primary. Four compact metrics, optional
  service setup and current viewers give context without reserving a large empty live-view area.
  Phone metrics share one compact summary, leaving the room list visible in the first viewport.
  Current viewers refresh through `get_viewing_now` every 15 seconds while visible, without
  invalidating page data. A timestamp, manual refresh and stale-state message replace the static
  Live label. Requests time out, do not overlap, and stop when the component is destroyed.
- **Data rooms:** searchable cards show document, link and investor counts. Creating a room names
  it first, then lands in its document workspace with the next action visible.
- **Documents:** browsing a folder changes the visible contents and breadcrumb. A title search
  searches the room. Files open directly; uploads and new folders are visible actions. Secondary
  metadata hides on small screens while row menus remain available.
  Phone file/folder actions and row menus have 44 px targets; table headers remain available to
  assistive technology. Shared room headings and backup notices are compact on small screens.
- **Sharing:** one row describes an audience, its protection and recent access. Copy is a direct
  action; edit, preview and revocation remain in the row menu. The editor starts with audience and
  label. Disclosures hold optional protection and expiry controls. Its body scrolls independently
  of the save footer, including on a phone. Room-default inheritance is preserved. Creation ends
  with an effective-access receipt and direct copy, preview and optional email actions. Group
  management opens in another tab; refreshing groups preserves the editor draft. Document access
  remains visible when no groups exist, including the scope of all-document access.
- **Analytics:** metrics precede filters and keyboard-operable tabs. Phone rows show email and
  reading time, with visits and last seen below the email. Additional columns stay on larger
  screens and in CSV exports. Empty answers do not create an empty table column.
- **Investors:** the email and profile link take priority on phones; last seen moves beneath them.
  Workspace blocking is in a separate disclosure. Erasure remains a confirmed profile action.
- **Storage:** connection, replication and file-copy state are distinct. Secrets never reappear in
  the form. Tests give success or failure feedback; a configured bucket is not described as a
  confirmed backup until replication succeeds and disk objects finish moving.

## Upload feedback

The upload tray belongs to the workspace layout, so navigation between rooms, overview and settings
does not hide an active batch. The header shows completed/total counts and aggregate byte progress.
Sending and failed files appear before queued and completed files. Each row identifies its room or
version target. It can be minimized while working; successful batches collapse automatically and
can be dismissed. Failed rows and batches offer retry without hiding the error. Dismissal changes
only the client receipt. Upload failures do not invalidate page data into an offline error screen.

## Investor experience

A compact room header leads to Documents and My questions. The portal supports folder browsing,
file-title search and direct viewing/download controls, with private conversations and requests
alongside them. Phone headings are compact, outstanding file requests are discoverable above the
documents, and document/reader controls use 44 px touch targets on phones. Branding and white-label choices still apply. The gate gives one step at a time,
including readable NDA text and visible errors.

The PDF reader fits its page, zoom and question controls on a phone. A question opens a dialog and
captures the page before editing. Arrow keys in its textarea do not navigate the document. Each
watermarked page keeps diagonal identity text and a readable identity footer; fewer, smaller rows
leave the document readable. This is a visual deterrent, not a restriction on a determined visitor.

## Verification

The revision was inspected as rendered screenshots at 1440 × 960 and 390 × 844 CSS pixels, then
revised after visual findings. Browser interaction checks covered room and folder creation, a native
PDF upload, folder/search navigation, sharing create/edit/reopen, phone navigation, analytics tabs,
the investor gate, PDF rendering and a private page-specific question. See the
[review record](../reviews/2026-11-11-r1.md) and its screenshots. All preview identities and files
are disposable fixtures; no real investor content was used.

The [UX refinement review](../reviews/2026-11-11-ux-refinement.md) records the later phone hierarchy,
touch-target and upload-feedback pass with before/after screenshots and real offline/retry checks.

The [sharing and investor UX review](../reviews/2026-11-13-sharing-and-investor-ux.md) records the
completion dialog, permission clarity, direct notification targets, current-viewer polling and
investor mobile layout, with real browser, access, upload and SMTP checks.

## Notification destinations

`list_notices` returns `href`, a relative member-only admin destination. The server resolves
conversation and request IDs within the notice’s room, falling back to the section when the item
no longer exists. Request cards expose stable fragment IDs and highlight the selected request.
Overview, Notifications and notice emails use the same resolver. Links do not grant access;
destination routes continue to enforce member authentication.

## Appearance editor

Workspace and room appearance use an explicit draft/save/cancel model. Room settings combine name,
welcome Markdown, logo and colour in one operation. Inheritance is visible and reset controls are
staged changes. The editor previews sample Documents and email Entry screens at two widths; live
investor link preview remains the way to check actual access. The welcome component and contrast
helper are shared with investor rendering. Keep controls usable at 320 px, bound the welcome editor's
height, and keep Save/Cancel visible when scrolling the preview.

See the [appearance visual review](../reviews/2026-11-13-room-appearance.md) for screenshots and verification.

Input boundaries use a dedicated contrast token, separate from decorative card borders. Default
inputs/buttons and dialog close targets are 44 px on phones; desktop density remains unchanged.
Mobile personalization uses Edit/Preview tabs with persistent drafts and save controls. Appearance
samples reuse investor navigation/cards/rows and resolve inherited workspace colour. They remain
samples; use permission-aware link previews for real content.

See the [UI standards implementation and screenshot gallery](../reviews/ui-standards-implementation-2026-11-13/index.html) for the eight improvements and verification results.

## Task visibility and resilient layouts

Document rows show full titles at narrow widths so identifying periods and versions remain visible. Search and folder browsing use compact welcome context, retain URL-backed filters and preserve the return location. Entry forms precede the extended welcome. PDF questions use a bounded scrollable dialog and a fixed-size textarea, including when the allowed question length is reached. Active PDF search replaces the mobile secondary toolbar row; page and zoom tools remain available in Reader options.

Appearance focus must stay above the measured sticky footer, and validation must reveal the invalid control. Device samples render at explicit 360/1280 px canvas widths with visible scaling and an actual-size option; Fit to panel follows available width. Sharing-link drafts need a discard decision on dismissal, including navigation. Mobile document controls precede the collapsible pinned summary. Urgent server warnings remain visible; backup setup details use disclosure. Mobile sharing rows reflow protection facts instead of removing them.
