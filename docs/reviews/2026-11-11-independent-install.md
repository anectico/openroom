# OpenRoom v0.1.0 install acceptance check: local candidate

Date: 2026-11-11. Target: the isolated container `openroom-clean-server` (Alpine, with its own nested Docker daemon 29.9.3). Every command ran through `docker exec openroom-clean-server ...`. Before the install, `/opt/openroom` did not exist and no containers were running.

**Scope:** this was a local test. HTTPS used Caddy's internal CA for `localhost`, and that CA was trusted only inside this throwaway server. It does **not** test public HTTPS, ACME/Let's Encrypt, DNS, sslip.io, ports reachable from the internet, a real VPS, or the public `curl | bash` install path, because the image is not published. Those still need a separate public VPS test.

## Commands run

1. `umask 077; bash /candidate-deploy/install.sh --email owner@example.test --domain localhost --version v0.1.0 --source /candidate-deploy --dir /opt/openroom --yes --json > /root/secure/install.json`
2. `docker cp openroom-caddy-1:/data/caddy/pki/authorities/local/root.crt /usr/local/share/ca-certificates/openroom-caddy-local.crt && update-ca-certificates`
3. `openroom-server doctor --json` (normal TLS validation, without `-k`)
4. Owner sign-in: POST `/api/auth/sign-in/email`. I found this endpoint in the login page's client bundle. The password was read from the private file and never printed.
5. `umask 077; openroom-server create-api-key owner@example.test --name 'Owner agent' --json > /root/secure/agent.json`
6. MCP Streamable HTTP at `https://localhost/mcp` with a Bearer key (the header was read from a mode-600 file and deleted afterwards): `initialize`, `tools/list`, `tools/call get_me`, `tools/call list_rooms`.

## Results

| Check                                                                                                                                                                                    | Result                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Installer exit / JSON `ok`                                                                                                                                                               | PASS: exit 0, `ok:true`, url `https://localhost`, version `v0.1.0`; result file has mode 600                                  |
| Containers                                                                                                                                                                               | PASS: app `ghcr.io/anectico/openroom:0.1.0` healthy, `caddy:2.11.8` up                                                        |
| Local CA trust                                                                                                                                                                           | PASS: "Caddy Local Authority - 2026 ECC Root" trusted; `curl https://localhost/healthz` returned 200 with ssl_verify_result=0 |
| `.env` permissions                                                                                                                                                                       | PASS: mode 600, owned by root                                                                                                 |
| One-time password removed                                                                                                                                                                | PASS: 0 `ADMIN_PASSWORD=` lines left in `.env` (only key names were checked, never values)                                    |
| Doctor: containers, HTTPS, database (quick_check ok), migrations (12 applied, last `0011_broken_deathstrike`), WAL 0.0 MB, replication (local file replica confirmed), litestream 0.5.17 | PASS                                                                                                                          |
| Doctor: disk                                                                                                                                                                             | **FAIL**: "2.0 GB free of 23.5 GB" (root filesystem 91% used)                                                                 |
| Doctor: app doctor                                                                                                                                                                       | **FAIL**: detail says "App checks completed". This looks like it fails only because of the disk check                         |
| Doctor overall                                                                                                                                                                           | **exit 1** because of the disk check                                                                                          |
| Owner sign-in                                                                                                                                                                            | PASS: HTTP 200, role `owner`; `/admin` returns 200 with the session (302 to login without it)                                 |
| API key creation                                                                                                                                                                         | PASS: exit 0, file mode 600, role `owner`, apiUrl `https://localhost/api/v1`                                                  |
| REST `/api/v1/me` with Bearer                                                                                                                                                            | PASS: 200, owner@example.test / owner                                                                                         |
| MCP `initialize`                                                                                                                                                                         | PASS: protocol 2025-06-18, server OpenRoom v0.1.0                                                                             |
| MCP `get_me`                                                                                                                                                                             | PASS: 200, returned owner@example.test, role owner                                                                            |
| MCP `list_rooms`                                                                                                                                                                         | PASS: `{"rooms":[]}`                                                                                                          |
| MCP without Bearer                                                                                                                                                                       | PASS: 401 (rejected as expected)                                                                                              |

## Failures and blockers

- **The doctor disk check fails in this environment** because the container's overlay root filesystem is shared and only about 2 GB is free. This comes from the test host, not the installer. Repeat the check on a VPS with more free disk to confirm a clean `doctor` exit 0.
- **"app doctor" gives an unclear message.** It reports `ok:false` with detail "App checks completed" and does not say which check failed. That is a small product issue: the message should name the failing check (here, disk).
- **Small inconsistency between docs and behaviour:** `install.md` says the installer "prints the generated owner password and OPENROOM_SECRET_KEY". With `--json`, they appear only in the JSON result, which matches the documented `--json` guidance.
- Public HTTPS and VPS testing were not done: there is no published image and no live domain or server.

## Secret handling

No passwords, secret keys, API keys, cookies or `.env` values were displayed or saved here. The private files stay in `/root/secure/` inside the throwaway server, all mode 600: install.json, agent.json, cookies.txt and signin.out. Delete them or destroy the container when the check is finished. Original data was left untouched; nothing outside the named container was changed.

## Codex follow-up verification

The disk failure was real: duplicated disposable images and unused build cache consumed the shared
Docker test filesystem. After removing the unused fixture copy and reclaiming unused build cache,
doctor passed every check with 3.4 GiB free. No application threshold was weakened.

The redundant “app doctor” failure was confirmed and fixed in `deploy/openroom-server`. Its JSON
now lists the actual failed app check, with a fallback only when no app checks can be read; failures
exit 2. The installed script was replaced with the corrected candidate and all checks passed.

The host cycle then installed the older local image on a fresh data volume, created a room, ran
`openroom-server update v0.1.0 --source /candidate-deploy`, rolled back the new migration through
`openroom-server rollback --yes`, updated again and verified the room and all doctor checks.
The offline `--source` flag copies the actual deploy files; Docker images and migrations were real.
This remains isolated local-server and local-CA validation. Public VPS/DNS/ACME and registry
publication are deferred by the owner.
