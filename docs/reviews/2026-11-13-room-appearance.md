# Room appearance and personalization

Implemented and verified locally on 13 November 2026. No deployment, database migration or dependency
change is included. Screenshots use fictional Aurora rooms, documents and investor identities.

## Delivered

- Workspace and room Appearance editors provide live Documents and email Entry previews, with
  desktop/phone widths. Room name and welcome Markdown sit alongside logo and colour controls.
- Changes stay local until Save appearance. Cancel restores saved values. Workspace inheritance is
  explicit; reset controls stage changes until saving. A failed save retains the draft. Save/Cancel
  remain visible while scrolling, and new editor controls have larger phone touch targets.
- Room name becomes the investor document-page heading. The welcome introduction remains available
  inside the room, including returning visits. It can be collapsed; long introductions start collapsed.
- Button text automatically uses black or white against the chosen accent. Navigation text and focus
  indicators use a darker variation. The helper is shared by entry screens, investor pages and previews.
- Investor favicons are 64×64 PNGs derived from the effective logo with transparent padding. They
  inherit the workspace logo when appropriate and fall back to the built-in icon when no logo exists.
  Admin pages keep the OpenRoom icon. Separate favicon uploads are not part of this pass.
- `update_branding` accepts optional logo, colour, room name and welcome fields in one save, with
  membership and frozen-room state rechecked after image storage. It updates existing database fields
  in a transaction and preserves object retention/refcounts. REST, MCP, OpenAPI and generated CLI
  expose the same operation. Existing `set_logo` and `update_room` callers remain supported.

## Verification

The production build ran through `src/server/index.ts` on Node 24 with a disposable real SQLite file
and local disk storage. Chromium exercised the real application; no application modules were mocked.

88 checks passed across three throwaway scripts:

- 50 browser/integration checks cover login, draft/save/cancel, workspace inheritance, logo upload,
  invalid colour, failed-save recovery, invalid-image rollback, responsive layouts, entry and returning
  investor sessions, safe Markdown, favicons, white labeling, REST and OpenAPI. Editor widths covered
  320, 390, 768 and 1440 pixels; investor views covered narrow phones and desktop.
- 16 server checks cover atomic field updates, audit payloads, observer/admin boundaries, permission
  removal during an actual image upload, retained original data after denial, orphan-object release,
  frozen rooms, duplication and reference counts, reset inheritance and colour parsing. One check
  sweeps 4,096 RGB combinations and verifies at least 4.5:1 contrast for button text and navigation
  against the tested light background.
- 22 follow-up checks cover generated CLI and MCP updates, refusing document objects at the favicon
  endpoint, admin favicon isolation, invalid image input, real observer HTTP/UI restrictions, dark
  brand colours, email access rejection, long/empty welcomes, removed/inherited/default favicon
  behavior, audit records, final phone overflow and 44-pixel Save/Continue targets.

Production build, Biome, Svelte checking (zero errors/warnings), the no-comments check, generated CLI
freshness and diff whitespace checks passed. No tests are added to the repository. Temporary test
scripts and credentials were removed after verification; no email or deployment was performed.

## Visual review

Screenshots were opened and inspected visually throughout implementation. The first phone review
found an unbounded textarea and a hidden file input causing horizontal overflow at 320 pixels. Both
were fixed, followed by a smaller persistent action bar and larger phone controls. The final images
below are direct browser captures, including native element captures of the editor/preview; they
have not been retouched. The entry phone image intentionally demonstrates a dark accent, while the
other investor images demonstrate the lighter gold accent with readable darker navigation.

- [Appearance editor on desktop](ui-appearance-2026-11-13/appearance-desktop.png)
- [Appearance editor on a phone](ui-appearance-2026-11-13/appearance-phone.png)
- [Entry preview](ui-appearance-2026-11-13/entry-preview.png)
- [Actual entry on a phone](ui-appearance-2026-11-13/entry-phone.png)
- [Investor room on desktop](ui-appearance-2026-11-13/investor-desktop.png)
- [Investor room on a phone](ui-appearance-2026-11-13/investor-phone.png)

Previews use sample documents and the email-entry state. Password, verification, NDA and actual file
permissions continue to follow sharing-link settings; use investor link preview for those. Per-link
welcome copy, cover images, contact cards, pinned documents and personal email notes remain separate
follow-up work.
