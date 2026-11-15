# OpenRoom review: access, delivery and recovery

Reviewed the checkout at `0c9e830`, after the earlier November 15 fixes. This pass found and fixed the following issues. The verification section distinguishes exercised behavior from failure paths reviewed in code.

| # | Trigger and consequence | Change |
|---|---|---|
| 1 | With an API key set, a destination passed to `create-webhook --url` or `upload-from-url --url` could override the CLI’s server and receive the bearer key. | Global flags precede the command. The command’s URL goes in its request body. |
| 2 | A path parameter of `.` or `..` was normalized by the URL client into a different API path. | Reject dot segments before making the request. |
| 3 | A demoted admin could download a previously prepared investor-data export, including IP addresses and private threads. | Both HTTP download routes and the status operation check the current role and original requester. Ordinary room exports remain available to their requester. |
| 4 | An expired export could still be reported as ready with a download URL until hourly cleanup. | Expiry is checked before returning member export status. |
| 5 | Rolling back the transaction that first generated the identity HMAC key left an unsaved key in memory. Later hashes could change after restart, breaking identity lookup and email blocks. | Initialize the key transactionally and reuse cached key material only when it matches the stored ciphertext. |
| 6 | Erasing one address could cancel another investor’s mail or replace an unrelated link label when their name or address contained the erased string. | Match address and name boundaries; keep exact ID-based cancellation. |
| 7 | The link editor sent the displayed “Erased investor” block back as an invalid email, preventing edits. Deleting the placeholder to save also removed the block. | Accept the placeholder when replacing link blocks and preserve the underlying hashes without disclosing the addresses. |
| 8 | Supplying an empty folder ID alongside a valid file ID passed group-permission validation but selected the empty ID for the write. | Reject empty IDs at the shared schema boundary. |
| 9 | Entry form actions could use gate state read before the request body arrived, including emailing a code after an intervening password or access change. | Resolve the link, policy and gate after reading the submitted form. Password verification still rechecks the hash after hashing. |
| 10 | Relaxing a gate requirement while an investor was entering could leave a reload on a blank “done” screen. | Finish a satisfied gate and issue the session on reload. |
| 11 | Completing a gate action charged the same HTTP request twice against the token-lookup limit. | Recheck state without charging the lookup again. |
| 12 | A blocked email on an allow list could receive an invite. Queued invites could still deliver a rotated address or disclose a room name after removal. | Check blocks before queuing and the current token, explicit recipient and access again before delivery. |
| 13 | A queued file-request email could disclose the request title after closure, blocking, or removal of the link from its target group. | Check the open request, target, verified recipient and current link at delivery. |
| 14 | Queued activity emails could reach removed members or ignore a subsequent preference change. | Verify active membership at delivery; new jobs also identify the original member and notice so current preferences apply. |
| 15 | A webhook could retry an investor event after the owner removed that event from its subscription. | Recheck the current filter before sending. |
| 16 | Subscribing to the email-cap webhook produced no delivery when the cap was reached. | Queue that event from the cap notification path, once per notice. |
| 17 | Starting and finishing file requests shared one hourly counter; starting the last allowed upload could make it impossible to finish that hour. | Apply separate limits to starts and completions. |
| 18 | After lowering the install upload limit, the investor page still advertised the old, larger file-request limit. | Show and enforce the same effective limit. |
| 19 | A missing or expired upload ID made the UI label the whole request closed. | Disable the form on loss of request access, not on an individual upload lookup failure. |
| 20 | The operation catalog and confirmation said closing a request hid it, although investors could still see its history. | Describe the actual effect in the shared operation and generated CLI catalog. |
| 21 | Passing an empty string to `set_logo` silently removed the existing logo. | Only explicit null removes it; empty data returns a validation error. |
| 22 | A truncated image with readable metadata could fail during decoding and produce an internal server error. | Handle decoder failures as invalid image input and preserve the prior branding. |
| 23 | Moving a folder to another parent left gaps in the old parent’s reported sibling positions. | Renumber both affected sibling lists. |
| 24 | Appending to a sufficiently large folder passed every position as a JavaScript function argument and could throw a range error. | Compute the next position in SQLite. |
| 25 | A deeply nested room index could draw PDF text outside the printable page. | Bound visual indentation while retaining the document’s hierarchical number. |
| 26 | Expired archives could still be advertised, retried, or built after the retention window. Two archives created in the same millisecond also had ambiguous precedence. | Respect expiry in status, retry, download and job startup; use insertion order to break creation-time ties. |
| 27 | Absolute DNS names such as `host.internal.` bypassed the internal-name check, though resolved IPs were still checked. Rejected non-200 imports kept draining their response bodies. | Normalize the terminal dot before validation and close rejected download streams immediately. |
| 28 | A failed in-place local `CURRENT` write could truncate the entire replica history. | Flush a temporary file and atomically replace the pointer. |
| 29 | A backward clock could append a history entry the next start rejected. Comparing timestamp strings also misordered valid timezone offsets. | Compare instants and reject the append before modifying history. |
| 30 | An S3 prefix append could create a `CURRENT` object larger than the reader’s own limit. | Check the prospective S3 object size before publishing it. |
| 31 | Rollback’s attached-schema column lookup returned snapshot columns for both databases, so a column absent from the live database could stop rollback. | Pass the schema as an argument to SQLite’s table-info function. |
| 32 | After a failed replica reconfiguration, an old retry could override newer settings; reverting to the former configuration could also leave its child stopped. | Ignore superseded retries and only skip configuration when its child exists. |
| 33 | A repeatedly crashing Litestream process reset the outage clock on every spawn, indefinitely delaying the documented fallback checkpoint. A forced stop could return before the old process had closed. | Clear the outage clock on confirmed sync and wait for actual child termination before replacement. |
| 34 | Local replica failures were hidden behind the generic local-backups warning and did not trigger outage notices. | Report local sync failure separately from the absence of off-server storage. |
| 35 | A failed environment-file read or interrupted rewrite in the host tool could discard the install’s secrets. | Write a private temporary file beside the original and rename it only after a successful read and write. |
| 36 | An unrecognized rollback plan was described as safe to repin. Installer/update version values could also introduce invalid image tags or extra dotenv lines. | Reject unknown plan actions and validate the tag before using it. |
| 37 | A container already publishing a required port was treated as a reason to ignore the port conflict. | Detect conflicting Docker port mappings as well as listening host sockets before starting the install. |
| 38 | Compose could interpolate a dollar sign in an owner email, changing the account or certificate contact. Machine-readable installer responses also broke on quotes or control characters, and missing flag values aborted outside the JSON error path. | Quote the email as a dotenv literal, escape JSON strings and validate value-taking flags. |

## Verification

- Reproduced the CLI key leak before the fix with two loopback HTTP servers and a sentinel credential. After the fix, both commands reached only the configured server and carried the external URL in JSON. Against the production HTTP server, the CLI created a webhook and the server rejected an import from a loopback address.
- Exercised shared operations against migrated SQLite and local disk. Checks included first-key rollback, erasure with overlapping addresses, retained redacted blocks, group input, folder moves, branding, archive expiry, real upload bytes, audit records and SQLite integrity and foreign keys.
- Used a production HTTP server, an authenticated browser session and a real API key. Both download routes served the investor export before demotion and denied it afterward; a room index remained available. Exercised entry from a completed gate, 40 upload starts, throttling of the 41st, raw PUT and successful completion.
- Used a loopback SMTP receiver for successful delivery and negative checks after removal, opt-out, blocking, address rotation and request closure. Verified that a cap event queued a webhook and that removing its event before delivery skipped the call.
- Exercised 150,000 sibling folders in SQLite, extracted text bounds from a 48-level PDF, checked local pointer replacement and chronological ordering, and checked deduplication of local replica outage notices.
- Built the Docker image and ran its launcher and Litestream on disposable data. A wrong key left the database absent and the pointer unchanged. A fresh restore recovered a real object and an encrypted setting. A schema rollback with differing settings columns preserved live storage settings, the replaced database and a new replica prefix.
- Checked installer error JSON, missing arguments, private environment-file replacement and the literal email received in a real Compose container. ShellCheck, shell syntax, Biome, Svelte checks, the no-comments check, catalog consistency and the production build passed.

The tests used local storage, local replication and loopback receivers. This pass did not run a public VPS installation, a live S3 transfer, third-party delivery, a power-loss test, or a ten-minute Litestream crash loop. The retry races, forced termination ordering and S3 history limit were reviewed in code. No database schema migration is required.

The production dependency audit reported five low-severity affected packages in one transitive chain, rooted at `deepmerge` through the Svelte build plugin. npm offered no fix and reported no moderate, high or critical advisories. This review did not establish that an investor request reaches the affected merge function.
