# Investor home layout correction

The previous README image exposed two layout problems: an almost full-width empty review bar and a narrow questions card reserving an otherwise empty desktop column. This change fixes the application layout and recaptures the README from the real application.

## Changes

- Start here combines its title, status and actions in one wrapping header. Before the first review, it shows a document count and Start review, without an empty bar. Partial progress uses a short bar and Continue review; completion keeps the count and All reviewed.
- One or two remaining pinned documents fill the available row. Reviewed documents remain available under Show reviewed and can be undone.
- Questions and unread replies sit beside search. Documents occupy the full content width; ZIP downloads stay below the list when permitted.
- Document titles and metadata form one clickable area with a minimum 44 px height. Format, size and section share a metadata line, reducing row height without shrinking action targets.
- Investor content begins closer to navigation. The owner appearance sample reflects the new initial state and questions placement.

## Verification

A production build and repository lint passed, including Svelte checking with zero errors or warnings. Seventeen grouped browser checks passed against a disposable real SQLite database and local disk storage. They cover explicit review saves, focus return, Undo, completion, persistence after reload, search, folder navigation, questions, requests, zero/one/six pins, long titles, phone expansion, actual ZIP preparation/download and owner previews. No application behavior was mocked. Temporary scripts are excluded from the repository.

Fresh captures cover 320, 390, 768, 1280 and 1440 px widths. Every retained image was inspected visually in addition to overflow assertions. The owner preview captures show the bounded, scrollable sample inside its existing editor; the surrounding editor is not a full-page capture. README previews are local Markdown renderings, not the live GitHub page.

The fictional Aster Robotics room contains 12 PDFs, a personal welcome, a team reply and a file request. The README shows one document explicitly marked reviewed through the real UI, with Show reviewed expanded. Its image is a complete 1280 px-wide page capture, avoiding a cut-off document row. No customer data or credentials are retained.

The original capture is [before.png](screens/before.png). Compare [initial desktop](screens/initial-desktop.png), [partial desktop](screens/partial-desktop.png), [phone](screens/partial-390.png) and the [new README image](../../images/investor-room.png). All checks and image paths are listed in [verification.json](verification.json).

## Scope

These are presentation changes. No database migration, permission rule or review-persistence behavior changed. Mobile checks use Chromium viewports rather than physical devices. This is not a release certification or a complete storage/access-control audit.

The live README image was subsequently replaced by the [configured branding capture](../investor-branding-2026-11-13/README.md). The screenshots in this review directory preserve the earlier layout verification.
