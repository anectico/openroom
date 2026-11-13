# README image and dependency review — 13 November 2026

The README now shows a populated, fictional Aster Robotics Series A room. The image was captured from the real application using disposable SQLite and local disk storage, with 12 PDF documents, three pinned documents, a personal investor welcome, one team reply and one file request. The fixture also included three investor links. No customer data is shown.

The retained image is `docs/images/investor-room.png`, captured at a 1280 × 1100 CSS-pixel viewport with a device scale factor of two. Visual inspection covered the full-resolution image, desktop and phone README previews, and the investor room at a phone viewport. The README previews used a local Markdown rendering rather than the live GitHub page.

## Reviewed and merged

| PR                                                | Update                        | Focused verification                                                                                                            |
| ------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [#2](https://github.com/anectico/openroom/pull/2) | svelte-sonner 1.2.3           | Real profile operation and visible success toast                                                                                |
| [#3](https://github.com/anectico/openroom/pull/3) | @lucide/svelte 1.71.0         | Build, type checking and rendered icons in screenshots                                                                          |
| [#4](https://github.com/anectico/openroom/pull/4) | S3 request presigner 3.1166.0 | Four old/new signing comparisons: GET and PUT, standard and custom path-style endpoints; signed URLs matched                    |
| [#5](https://github.com/anectico/openroom/pull/5) | better-auth 1.7.20            | Member login, API key creation and immediate rejection after revocation, sign-out and subsequent owner-operation rejection      |
| [#6](https://github.com/anectico/openroom/pull/6) | markdown-it 15.0.3            | Twelve formatting and unsafe-input fixtures produced identical output to the previous renderer; real welcome rendered correctly |

All five updates were installed and tested together before merging. `npm run build` and `npm run lint` passed, with zero Svelte errors or warnings and the no-comments check passing. Browser checks reported no page errors. Each PR's GitHub check and image jobs passed before merging. After merging, local package and lock files matched the tested combined files byte for byte.

[PR #1](https://github.com/anectico/openroom/pull/1), moving the Docker runtime from Node 24 to Node 26, remains open. The documented runtime is Node 24; a runtime change needs separate native-module, launcher, install, restore and rollback verification.

## Limits and evidence correction

S3 comparisons exercised actual SDK signing with fixed fictional credentials, without external requests. They do not establish upload, restore or storage-migration compatibility. Docker builds ran in PR CI, not locally. This review is not a release certification or a complete access-control audit. Temporary fixtures and test scripts are not committed.

The earlier bug-review report was corrected: a signed-out admin operation redirects to login with HTTP 303; the admin helper rejects the non-JSON response. REST API key failures return HTTP 401. The rejected false-success finding remains rejected, with its explanation corrected.
