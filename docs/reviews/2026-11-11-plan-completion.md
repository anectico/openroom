# Local release completion

The requested local implementation is finished, including the UI revision and visual validation.
All changes remain uncommitted; HEAD is `e25e210`. The owner explicitly chose local release
preparation and deferred live-server/domain details, private raise content and launch.

The subsequent feature recheck maps all 65 first-release features and completes the folder-drop
and investor reading-detail gaps. The separate bug-fix review subsequently completed 30 fixes and
54 checks. The [UX refinement](2026-11-11-ux-refinement.md) then validated the combined app and
repeated build/lint checks. See the [feature coverage record](2026-11-11-feature-coverage.md).

| Work                   | Acceptance                                                                                                                   | Result                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| M0 foundation          | Launcher, SQLite pragmas, safe migrations, local replication, jobs, Docker, installer, host tools and CI                     | Built; clean-server install, update and rollback exercised            |
| M1 owner core          | Audited operations, members/roles/keys, documents/folders/versions, streaming uploads, links and optional email              | Built; real access checks and browser workflows passed                |
| M2 investor access     | Password/email/code/fields/NDA gates, current restrictions, groups, previews and protected files                             | Built; real gate, permission and revocation checks passed             |
| M3 viewer              | PDF/image/video, watermark, screenshot protection, downloads and zip                                                         | Built; desktop/phone vision and real media/upload checks              |
| M4 tracking            | Reading/activity, investor/firm/file analytics, viewing now, CSV and notifications                                           | Built; responsive visual review and privacy/rendering checks          |
| R1 storage/privacy     | Optional encrypted S3, multipart, disk migration, replication notices, CURRENT history, fresh restore and erasure            | Built; real S3, erasure and large-file recovery checks passed         |
| M5 deal tools          | Private conversations, FAQ, requests, duplication, index, freeze/archive, webhooks, branding, data export and key rotation   | Built; browser review and real access/privacy/recovery checks         |
| M6 retained objects    | Reference-safe daily cleanup after 30 days, first-seen weekly stray grace, export/archive exceptions, no replica deletion    | Done locally; real disk/S3 checks                                     |
| M6 storage moves       | Verified S3-to-disk and bucket changes; paused uploads, pending uploads, archives, failure/retry/cancel, old bucket retained | Done locally; 32 storage/retention checks                             |
| M6 recovery            | Real replica, RESTORE_AT, original secrets/files, wrong-key refusal and schema rollback after storage changes                | Done locally; 15 checks with controlled day-29 cleanup                |
| Large uploads/recovery | Actual multipart file above 5 GiB, SHA-256, last-byte range, fresh restore and doctor                                        | Passed with 5,369,757,696 actual bytes; final image restore rechecked |
| M7 MCP                 | Every operation, legacy/modern clients, current roles, audit, confirmations and untrusted-data labels                        | Done; 98 tools match registry and OpenAPI                             |
| M7 uploads             | Inline files, guarded URL imports and raw streaming through MCP/CLI                                                          | Done; real HTTP and browser checks                                    |
| M7 CLI                 | Independent generated package, all operations, folder tree, confirmations, version warning and doctor                        | Done; tarball installed outside repo and exercised                    |
| M7 skill               | Install, first room, sharing, activity, replies, update and recovery runbooks                                                | Done; skill validation passed                                         |
| UI                     | Desktop and phone screenshots, dialogs, investor gates, documents, media, conversations, requests and settings               | Done; final production screens inspected with vision                  |
| M8 local security      | Access/storage/rendering checks, verified fixes and dependency/secret scans                                                  | Done locally; external OpenCode review unavailable without credential |
| M8 local install       | Independent Claude Code clean-server install, trusted local HTTPS and doctor; host update/rollback/re-update                 | Passed; original install report plus Codex follow-up                  |
| M8 docs/release        | Human guides and screenshots, agent runbooks, llms index, package/image and release workflows                                | Done locally; artifacts prepared                                      |

## Evidence

- [First-release feature coverage](2026-11-11-feature-coverage.md) maps all 65 feature bullets and records the gaps completed during the recheck.
- [UX refinement](2026-11-11-ux-refinement.md) records phone hierarchy, touch targets, persistent upload feedback and real connection-loss recovery.
- [Security review](2026-11-11-security.md) records confirmed fixes, real checks and the external-review gap.
- [Independent install report](2026-11-11-independent-install.md) preserves its initial findings and follow-up verification.
- [UI validation and screenshots](2026-11-11-ui.md) records the visual work and route coverage.
- [Release runbook](../contributing/release.md) explains package, image, installation, update and recovery validation.
- Local artifacts are in `artifacts/release/`; the image is `openroom:local-release`. Nothing was published.

At the initial local release acceptance, the production build, Docker build, lint (zero Svelte errors or warnings), no-comments check,
generated CLI catalog parity, skill validation and installer shell checks passed. The exact
750,000-byte inline upload passed through both REST and MCP. The latest image restored the existing
5 GiB-plus replica and passed every doctor check. The local release manifest records the image ID,
CLI package checksum and validation results.

The day-29 drill runs the actual cleanup function with its explicit clock 29 days ahead and restores
a real replica at a recorded real cutoff. It proves retention behavior and point-in-time recovery;
it does not represent 29 elapsed days.

## Deferred live launch

A public VPS install, owned-domain/public ACME checks, hosted email/S3 credentials, registry
publication and actual fundraising content await the owner's launch details. The local server used
Caddy's local CA and normal certificate validation, not a public certificate. The optional two-model
OpenCode security review did not start because OpenRouter authentication was unavailable; no clean
external review is claimed. Complete that independent pass before live launch.
