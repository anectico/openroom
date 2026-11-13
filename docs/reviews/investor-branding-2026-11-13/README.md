# Visible investor branding and personal welcomes

The investor home now gives the configured company logo and personal introduction a clear place above document search. The README example uses a configured fictional company instead of default branding.

## What changed

- A shared identity component displays the company logo, room name and brand-coloured “Private investor room” label in the investor header and owner appearance sample. Logos preserve their proportions and wrap with the room title on narrow screens.
- The introduction sits inside a brand-accented panel. A link-specific message is labelled “Personal welcome”; the general room introduction remains the fallback.
- Messages of up to 600 plain-text characters open initially. Longer messages show a two-line excerpt. Explicit expand/collapse choices persist for that welcome revision in the browser tab; a revised message gets its own initial state.
- Search and folder navigation use a compact disclosure without overwriting the home preference. Owner appearance help and documentation describe the same behaviour.
- Visual inspection caught a wrapping “Show less” control at 320 px. The final control stays on one line.

## Reproduce the demo appearance

Use a disposable workspace with fictional documents and people. These are ordinary application settings, saved through the existing audited operations; no screenshot-only CSS or fabricated progress is involved.

1. In workspace appearance, upload [the fictional Aster logo](../../images/aster-demo-logo.png), set the colour to `#3c4bb4`, and keep product attribution enabled. For agents, use `update_branding` with `imageBase64`, `accentColor` and `whiteLabel: false`.
2. Name the room **Aster Robotics · Series A**. Leave its logo and colour inherited from the workspace. Set the general introduction below through room appearance or `update_branding` with `roomId` and `welcomeMarkdown`.
3. Upload 12 example PDFs: eight root documents and two folders with two documents each. Pin **Investor deck · November 2026**, **Financial plan · 2026–2028** and **Customer metrics · Q3 2026**, in that order. Use the room UI or `set_pinned_documents` with their real file IDs.
4. Create a dedicated link for Maya and the Northstar team and set its personal welcome below. Agents use `create_link` or `update_link` with `welcomeMarkdown`. Keep separate links for other recipients; a link without an override uses the general introduction. Choose access gates appropriate to the environment rather than copying demo authentication settings.
5. For the screenshot state, open the room as its fictional investor, explicitly mark the deck reviewed, and expand **Show reviewed (1)**. Add one fictional question with a team reply and one outstanding file request. The resulting checklist shows real saved progress of one of three documents.

General introduction:

```markdown
Welcome to Aster Robotics. Explore our Series A materials, including the business overview, financial plan and customer metrics.

**Alex Morgan** · Co-founder & CEO
```

Personal welcome:

```markdown
**Welcome, Maya and the Northstar team.**

It was great meeting you. We’ve prepared these materials for your review of our Series A. Start with the investor deck, then explore the financial plan and customer metrics.

Ask us a question on any document — we’ll reply here.

**Alex Morgan** · Co-founder & CEO, Aster Robotics
```

The captured demo used real SQLite and disk storage, real PDF uploads, no email provider and no S3. Its credentials and temporary scripts are not committed. The fictional logo is an original demo asset.

## Verification and visual review

Production build and repository lint passed on Node 24.21.0, including zero Svelte errors or warnings and the no-comments check. Twenty-four grouped browser checks passed against the real app with no browser page errors. [verification.json](verification.json) records each check and the screenshot inventory.

Checks cover configured branding, inheritance and reset, unusual logo proportions, bright colours, empty introductions, white-labelling, personal-message separation, unauthenticated requests, Markdown safety, disclosure keyboard behaviour and persistence, changed welcome revisions, storage failure, search/folders, review saves, questions, PDF reading and owner previews.

Fresh captures were visually inspected at 320, 390, 768, 1280 and 1440 px widths. See the [configured desktop](screens/configured-demo-desktop.png), [configured phone](screens/configured-demo-phone.png), [smallest phone](screens/welcome-320.png), [long-message excerpt](screens/long-welcome-excerpt.png), [owner preview](screens/owner-preview-desktop.png) and [PDF reader](screens/reader-phone.png). Every retained screenshot was inspected with vision after capture.

The README image is a complete 1280 px-wide application page captured at device scale factor 2. The local README renderings show that same image at desktop and phone widths; they approximate Markdown presentation and are not captures of the live GitHub page. At phone width the desktop screenshot is an overview; the separate phone capture shows the actual responsive UI. PDF screenshots are viewport captures, avoiding unloaded off-screen pages. Owner preview captures show the bounded sample inside its editor.

## Scope and limits

No database schema, permission rule or owner operation changed. Browser checks used Chromium viewports, not physical phones or Safari. This is focused regression evidence for the changed surfaces, not a complete release, backup/restore or access-control audit. The pre-existing local server was left untouched; the configured screenshot fixture ran separately and was removed after verification.

## Approved welcome border refinement

After visual review, the coloured top rule was removed from the shared welcome component. The tinted title background, personal message and other branding remain. The current README image was recaptured from a production build using a fresh real SQLite/disk fixture with the same fictional company, 12 documents and one saved review. The screenshots in this directory retain the earlier design for comparison.

The updated README capture and 390 px phone welcome were inspected visually. Build and lint passed with zero Svelte errors or warnings. Focused browser checks confirmed a zero-width top rule, no phone overflow, review saving, remembered collapse after reload and Enter-key expansion, with no page errors.
