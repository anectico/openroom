# First-release feature coverage

The first-release list has 65 feature bullets across the 11 groups below. The source review maps
each group to implemented code. Real integration checks and the visual review are recorded in the
[completion](2026-11-11-plan-completion.md), [security](2026-11-11-security.md) and
[UI](2026-11-11-ui.md) records. Publication and live installation are separate acceptance work.

| Group                 | Implemented first-release features                                                                                                             | Owning implementation                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rooms and files · 10  | Rooms; nested folders; numbering; PDF/CSV index; PDF/image/video; download-only files; versions; bulk/folder upload; duplication; title search | `src/lib/operations/rooms.ts`, `files.ts`, `uploads.ts`; `src/lib/admin/uploads.svelte.ts`; `src/lib/server/room-index.ts`, `duplicate.ts`; admin document page and investor viewer routes |
| Links and access · 9  | Personal/open links; allow/block lists; verification; passwords; expiry/revocation; custom fields; defaults/overrides                          | `src/lib/operations/links.ts`, `blocks.ts`; `src/lib/server/viewer/access.ts`, `gates.ts`; sharing editor and entry routes                                                                 |
| Protection · 6        | Versioned NDA; watermark; screenshot protection; download controls; inherited groups; investor preview                                         | `src/lib/operations/nda.ts`, `groups.ts`, `links.ts`; `src/lib/server/viewer/`; reader components; sharing and group pages                                                                 |
| Analytics · 6         | Per-page tracking; video segments; per-investor history; firm rollups; viewing now; CSV                                                        | `src/lib/server/viewer/tracking.ts`, `activity-views.ts`, `exports.ts`; `src/lib/operations/activity.ts`; analytics and investor pages                                                     |
| Deal tools · 6        | Private Q&A; FAQ; private file requests; investor email invites; freeze/archive; whole-room zip                                                | `src/lib/operations/questions.ts`, `requests.ts`, `links.ts`, `rooms.ts`, `exports.ts`; `src/lib/server/archive.ts`; question and request routes                                           |
| Notifications · 3     | Event notices; in-app/email/webhook delivery; per-member preferences                                                                           | `src/lib/server/activity.ts`, `email.ts`, `webhooks.ts`; `src/lib/operations/activity.ts`; notification page                                                                               |
| Team · 3              | Members and roles; link/email invitations and password recovery; immutable audit                                                               | `src/lib/operations/members.ts`, `api-keys.ts`, `audit.ts`; `src/lib/server/auth.ts`, `members.ts`, `audit.ts`; host tools                                                                 |
| Branding · 3          | Install/room logo, colors and welcome text; custom domain support; white-labeling                                                              | `src/lib/operations/branding.ts`; `src/lib/server/branding.ts`; investor layouts; `deploy/openroom-server`                                                                                 |
| Agents · 6            | MCP; generated CLI; REST; destructive confirmations; agent installation workflow; skill and llms index                                         | `src/lib/operations/`; `src/lib/server/http/`; `cli/`; `docs/agents/install.md`; `skills/openroom/`; `llms.txt`                                                                            |
| Hosting and setup · 8 | App plus Caddy; admin-email bootstrap; one-command installer; integration settings/tests/guides; setup card; optional email; doctor; updates   | `src/launcher/`; `src/lib/server/system-health.ts`; settings operations/pages; `deploy/`; agent install runbook                                                                            |
| Data safety · 5       | S3 replication; point-in-time restore; rollback; health notices; investor export/erasure/retention                                             | `src/launcher/`; `src/lib/server/storage.ts`, `storage-transfer.ts`, `object-cleanup.ts`, `erasure.ts`, `viewer-data.ts`; privacy operations and host tools                                |

## Gaps found and completed during the feature recheck

- The browser's folder picker retained relative paths, but native directory drops were treated as
  flat files. Native drops now traverse the actual directory entries, drain every reader batch,
  preserve empty folders, support mixed loose files and folders, and retain the selected destination.
  All 108 real dropped files were verified against their SHA-256 values, including more than 100
  entries in one directory. Hidden entries are skipped consistently with picker uploads.
- Investor detail exposed totals without its recorded page/version drill-down. `get_viewer` now
  returns per-file versions, current-version markers, page times across that investor's visits and
  merged watched video ranges. The admin dialog, REST, MCP and generated CLI expose the same data.
  Other investors' reads are excluded. File deletion removes its live activity as before.
- Group permissions now offer a preview button beside each active sharing link. The preview was
  checked for both visible and hidden documents and creates no investor activity.
- Activity version lists now respect their time/link/group filters. Video coverage counts unique
  investors across repeat visits instead of counting their sessions as separate investors.

The feature-recheck script passed 26 checks against the production build: real native directory
entries, 108 streamed files and hashes, nested/empty/mixed drops, two PDF versions, page times
across two visits, a separate investor's exclusion, overlapping video ranges, filtered activity,
REST/MCP/CLI parity, group preview permissions, deletion cleanup and no browser console errors.
Desktop and phone captures are linked in the UI review. The script and fixtures are disposable.

## First-release scope choices

Groups preview through an active link so the preview includes that link's protection settings.
Document order uses Move up/Move down or the position fields on the API; dragging is used for file
and folder uploads. The upload limit defaults to 5 GB and can be increased by the owner. These are
the implementation choices recorded in the milestone status, not additional unfinished features.

The plan's separate later-stage list is excluded from this release: room AI chat, redaction,
stamped PDF downloads, chat-app OAuth, SSO, multiple teams, Office conversion, document-content
search, audit chains, IP country lookup, social previews, external-link items, multiple instances,
additional hosting templates, resumable uploads and translations.

Live domain/provider validation, registry publication and the unavailable independent external
security review remain in the [launch checklist](2026-11-11-plan-completion.md#deferred-live-launch).

## Follow-up validation

The separate chat “Find and fix 30 bugs” completed its fixes and 54 checks; its temporary scripts
were removed. Its changes and this feature pass were preserved together. The subsequent
[UX refinement](2026-11-11-ux-refinement.md) checked the combined production app and repeated the
build and repository-wide lint. Earlier statements about an actively changing checkout describe
the state during the first feature check, not the final UX refinement.
