# Install OpenRoom for an owner

Start from the owner's request and preserve their decisions. If a server, domain or email was already
provided, reuse it. Ask only for missing information. Never put passwords, API keys or the OpenRoom
secret key in chat, screenshots, shell history or a repository.

## Before starting

The owner needs a terminal or a coding agent on their computer and a Linux server with SSH access.
Use a 64-bit x86 or ARM VPS with at least 2 GB RAM and enough disk for documents, temporary zip
exports and database snapshots. Docker Compose v2 runs the app and Caddy. Only the owner email is
required; a domain, email delivery and S3 are optional.

Confirm whether a server already exists, whether the owner has a domain, and which email should
be the first owner. Renting a server requires the owner's approval. If they need one, guide them
through their chosen provider's console: create a project, choose Ubuntu or Debian, select the
smallest suitable instance and add an SSH public key before creating it. For Hetzner, account
verification may need the person; in DigitalOcean, use a Droplet. The app requires no paid add-ons.
Provider charges are separate from OpenRoom. Do not create or pay for infrastructure without the
owner's instruction.

Create a dedicated SSH key if needed, with `ssh-keygen -t ed25519`; let the person choose its
passphrase. Show only its `.pub` file when adding it at the provider. Connect with
`ssh root@SERVER_IP`, verify the host fingerprint with the provider, and keep the private key local.

For an owned domain, add an A record for the chosen subdomain to the server's IPv4 address. Add AAAA
only if IPv6 actually reaches this server. Check resolution with `dig +short`, then check ports 80
and 443. Without a domain, the installer uses the server's IP under sslip.io.

## Install

The public command requires a published release image and deploy files. For an unpublished local
candidate, follow the isolated local-server drill in [release validation](../contributing/release.md).

Run this on the server, replacing the email and optionally adding `--domain rooms.example.com`:

```sh
curl -fsSL https://raw.githubusercontent.com/anectico/openroom/main/deploy/install.sh | sudo bash -s -- --email you@example.com --yes
```

The installer installs Docker if missing, writes `/opt/openroom/.env` with restrictive permissions,
starts the stack and installs `openroom-server`. It prints the generated owner password and
`OPENROOM_SECRET_KEY` once. Have the owner save both in a password manager immediately; the secret
key is required for disaster recovery. Do not repeat them in chat. JSON automation uses `--json`;
redirect that result to a private file with `umask 077` and remove it after secure storage.

Verify over SSH:

```sh
openroom-server doctor --json
```

Each failed check includes a fix. Check the containers, valid HTTPS certificate, `/healthz`, SQLite,
migrations, disk, WAL and confirmed Litestream replication. The local replica passes replication
checks but still lives on the same server. The admin UI warns until remote S3 protection is ready.
If TLS fails, check DNS, ports and Caddy logs. sslip.io can hit shared certificate limits; wait or use
an owned domain. Never disable certificate validation to declare a live install healthy.

Sign in at `/admin` with the saved credentials. The seed is one-time and the installer removes
`ADMIN_PASSWORD` from `.env` after successful setup. Public member sign-up is disabled.

## Connect the owner's agent

Create a dedicated key over SSH, capturing its JSON in a private file:

```sh
umask 077
openroom-server create-api-key you@example.com --name 'Owner agent' --json > /tmp/openroom-agent.json
```

Read that file into the agent's secret configuration. Connect a Streamable HTTP MCP client to
`https://DOMAIN/mcp` with `Authorization: Bearer KEY`; the endpoint supports both legacy and modern
protocol clients without a persistent session. Never expose the key in a chat or commit it. Verify
`get_me`, then `list_rooms`. Delete the temporary file after the key has been stored securely.
The same key can use REST at `/api/v1` and the [CLI](../cli.md).

## Optional services

The owner can keep using OpenRoom without either service. Offer [email](../email.md) for verification
codes, invitations and notices, and [S3](../storage-and-backups.md) for off-server files and database
backups. Follow those guides, save credentials through the operations, and run `test_email`,
`test_storage` and `test_replication` as applicable. Request secrets through a secure local input,
not chat. Turn verification on only after email works.

Continue with [the first-room runbook](first-room.md). For updates, rollback and recovery, use
[operations and recovery](operations-and-recovery.md).
