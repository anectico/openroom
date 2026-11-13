# Sharing and investor UX pass

Implemented and checked locally on 13 November 2026. This pass covers sharing completion,
document-access clarity, notification destinations, current-viewer updates and investor mobile
layout. No deployment, database migration or new dependency is included.

## Changes

- Creating a sharing link keeps a completion dialog open with the effective audience, document
  group, protection, downloads and expiry. Copy and investor preview are direct actions. Optional
  email invitations show their individual recipients, report queued/skipped addresses and prevent
  repeat clicks after queuing. Creation alone never sends invitations. Editing retains its existing
  save behavior; Share can start another link immediately after completion.
- Document access is always visible. All-document access explains that future uploads are included.
  Group management opens in another tab; Refresh groups retains the draft. Missing selected groups
  require a new selection. Download-only exceptions are explained beside protection and in the receipt.
- Notices now return a relative member-only `href` through the operation registry, REST, MCP and
  the generated CLI catalog. Conversations open directly; file requests open at a highlighted card.
  Missing items fall back to their room section. Destination IDs are checked against the notice’s
  room. Overview, Notifications and notice emails share the same resolver.
- Current viewers refresh every 15 seconds while Overview is visible, with a timestamp and manual
  refresh. The overview count follows the panel. Offline/failure states retain the last-known list
  and replace the count with a dash. Reconnection refreshes automatically. Polling has a timeout and
  cleanup, and does not invalidate the entire page.
- Investor phone headers are compact, file requests appear above documents in a disclosure, and
  supporting text is more readable. Document actions and PDF navigation/zoom controls have 44 px
  phone touch targets. The PDF toolbar wraps on narrow screens without page overflow.

## Verification

The production build was served through `src/server/index.ts` on Node 24, using a disposable SQLite
file and real local disk storage. Browser checks used Chromium. Email delivery used a disposable
local SMTP capture service; no real recipients were contacted. Fixtures and screenshots contain
only fictional rooms, investors and documents.

80 checks passed:

- 62 browser/integration checks: owner login, group creation and grants, draft preservation, link
  creation/edit/copy, receipt focus and footer visibility, investor preview, allowed and denied file
  access, the real email gate, real request upload, private questions, exact notification targets,
  anonymous/private access rejection, PDF rendering, automatic viewer refresh, synchronized counts,
  offline/reconnection behavior, REST results, OpenAPI output and no JavaScript exceptions.
- 11 additional checks: optional invitation visibility, explicit-send behavior, queued feedback,
  real SMTP receipt containing the created link, MCP and generated CLI destinations, reopening Share
  after completion, retained drafts on offline group refresh/save, successful retry and no JavaScript
  exceptions. Reopening Share is exercised as part of the offline-draft sequence.
- 7 checks against the actual SQLite-backed destination resolver: missing conversation/request
  fallbacks, rejection of cross-room destination IDs, and storage, email-cap and archive destinations.

Responsive checks covered 320, 390, 768 and 1440 px. Production build, repository-wide lint,
Svelte checking (zero errors/warnings), no-comments checking, CLI catalog freshness and diff whitespace
checks passed. Throwaway scripts were removed; no tests are added to the repository.

## Screenshots

These are unretouched browser captures from the disposable application.

- [Sharing completion on a phone](ui-sharing-2026-11-13/sharing-phone.png)
- [Optional email invitation on a phone](ui-sharing-2026-11-13/sharing-email-phone.png)
- [Investor documents and request disclosure](ui-sharing-2026-11-13/investor-phone.png)
- [PDF reader on a phone](ui-sharing-2026-11-13/reader-phone.png)
- [Overview and current viewers](ui-sharing-2026-11-13/overview-desktop.png)

PDF text accessibility/search, browsing-state persistence, bulk document actions, onboarding
checklists and starter room structures remain separate follow-up work from the broader UX review.
