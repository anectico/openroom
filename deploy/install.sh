#!/usr/bin/env bash
set -euo pipefail

REPO="anectico/openroom"
IMAGE_REPO="ghcr.io/anectico/openroom"
DIR="/opt/openroom"
DOMAIN=""
EMAIL=""
VERSION=""
YES=0
JSON=0
SOURCE=""
RESTORE_SOURCE=""
RESTORE_TIME=""
RESTORE_SECRET=""

log() { [[ "$JSON" == "1" ]] && echo "$*" >&2 || echo "$*"; }
die() {
	if [[ "$JSON" == "1" ]]; then printf '{"ok":false,"error":"%s"}\n' "$*"; else echo "install: $*" >&2; fi
	exit 1
}

usage() {
	cat <<'USAGE'
Install OpenRoom on this server.

  --email you@example.com   the first owner's email (required)
  --domain dataroom.example.com
                            your domain; without one, <server-ip>.sslip.io is used
  --version v1.2.3          a release (the latest by default)
  --dir /opt/openroom       where the settings live
  --yes                     do not ask questions
  --json                    print the result as JSON
  --restore-from URL       restore a stopped install from s3://bucket/db
  --restore-at TIME        restore an earlier ISO 8601 time with a time zone
  --secret-key KEY         the secret key saved from the old install
                            S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID and
                            S3_SECRET_ACCESS_KEY are read from the environment
  --source DIR              take the deploy files from a local folder (for testing)
USAGE
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--email) EMAIL="$2"; shift 2 ;;
		--domain) DOMAIN="$2"; shift 2 ;;
		--version) VERSION="$2"; shift 2 ;;
		--dir) DIR="$2"; shift 2 ;;
		--restore-from) RESTORE_SOURCE="$2"; shift 2 ;;
		--restore-at) RESTORE_TIME="$2"; shift 2 ;;
		--secret-key) RESTORE_SECRET="$2"; shift 2 ;;
		--source) SOURCE="$2"; shift 2 ;;
		--yes|-y) YES=1; shift ;;
		--json) JSON=1; YES=1; shift ;;
		-h|--help) usage; exit 0 ;;
		*) die "unknown option $1" ;;
	esac
done

if [[ -n "$RESTORE_SOURCE" ]]; then
	[[ "$RESTORE_SOURCE" == s3://* ]] || RESTORE_SOURCE="s3://$RESTORE_SOURCE/db"
	[[ "$RESTORE_SECRET" != *$'\n'* && "$RESTORE_SECRET" != *$'\r'* && "$RESTORE_SECRET" != *"'"* ]] || die "the secret key cannot contain line breaks or single quotes"
	[[ ${#RESTORE_SECRET} -ge 32 ]] || die "restore needs the old --secret-key (at least 32 characters)"
	[[ -n "${S3_BUCKET:-}" && -n "${S3_ACCESS_KEY_ID:-}" && -n "${S3_SECRET_ACCESS_KEY:-}" ]] || die "restore needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in the environment"
	[[ "$RESTORE_SOURCE" == "s3://$S3_BUCKET/db" ]] || die "--restore-from must match s3://S3_BUCKET/db"
else
	[[ -z "$RESTORE_TIME" && -z "$RESTORE_SECRET" ]] || die "--restore-at and --secret-key need --restore-from"
fi

[[ "$(id -u)" == "0" ]] || die "run as root, for example: curl -fsSL https://... | sudo bash"
[[ -f "$DIR/.env" ]] && die "OpenRoom is already installed in $DIR. Use openroom-server update instead; reinstalling would replace your secrets."

ask() {
	local prompt="$1" var="$2"
	[[ "$YES" == "1" ]] && return 0
	{ : < /dev/tty; } 2>/dev/null || return 0
	read -r -p "$prompt" "${var?}" < /dev/tty || true
}

if [[ -z "$EMAIL" ]]; then ask "Your email (the first owner): " EMAIL; fi
[[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "a valid --email is required"

if ! command -v docker >/dev/null 2>&1; then
	log "Installing Docker..."
	curl -fsSL https://get.docker.com | sh >&2
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
command -v openssl >/dev/null 2>&1 || die "openssl is required"

public_ip() {
	curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true
}

if [[ -z "$DOMAIN" ]]; then
	ask "Your domain (leave empty to use a free <ip>.sslip.io address): " DOMAIN
fi
if [[ -z "$DOMAIN" ]]; then
	ip="$(public_ip)"
	[[ "$ip" =~ ^[0-9.]+$ ]] || die "could not find this server's public IP; pass --domain"
	DOMAIN="${ip//./-}.sslip.io"
fi
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "not a domain name: $DOMAIN"

if [[ -z "$VERSION" ]]; then
	VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -m1 '"tag_name"' | cut -d'"' -f4 || true)"
	[[ -n "$VERSION" ]] || die "could not find the latest release; pass --version"
fi
VERSION="v${VERSION#v}"
SOURCE="${SOURCE:-https://raw.githubusercontent.com/$REPO/$VERSION/deploy}"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
	ufw allow 80/tcp >&2; ufw allow 443/tcp >&2; ufw allow 443/udp >&2
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
	firewall-cmd --permanent --add-service=http --add-service=https >&2 && firewall-cmd --reload >&2
fi

port_busy() {
	command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
}
for port in 80 443; do
	if port_busy "$port" && ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":$port->"; then
		die "port $port is already used by another program (often apache or nginx). Stop it, then run this again."
	fi
done

mkdir -p "$DIR"
fetch() {
	if [[ "$SOURCE" == /* ]]; then cp "$SOURCE/$1" "$2"; else curl -fsSL "$SOURCE/$1" -o "$2"; fi
}
fetch docker-compose.yml "$DIR/docker-compose.yml"
fetch Caddyfile "$DIR/Caddyfile"
fetch openroom-server /usr/local/bin/openroom-server
chmod 755 /usr/local/bin/openroom-server

ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
SECRET_KEY="$(openssl rand -hex 32)"
if [[ -n "$RESTORE_SOURCE" ]]; then
	log "The old OpenRoom server must be stopped before restoring. Two running servers must never share this bucket."
	if [[ "$YES" != "1" ]]; then
		answer=""
		ask "The old server is stopped and you are ready to restore? [y/N] " answer
		[[ "$answer" =~ ^[Yy]$ ]] || die "restore cancelled"
	fi
	SECRET_KEY="$RESTORE_SECRET"
	ADMIN_PASSWORD=""
fi
umask 077
cat > "$DIR/.env" <<ENV
ADMIN_EMAIL=$EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
OPENROOM_SECRET_KEY='$SECRET_KEY'
DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
OPENROOM_IMAGE=$IMAGE_REPO:${VERSION#v}
OPENROOM_PREVIOUS_IMAGE=
ENV
write_env() {
	local key="$1" value="$2"
	[[ "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *"'"* ]] || die "configuration values cannot contain line breaks or single quotes"
	printf "%s='%s'\n" "$key" "$value" >> "$DIR/.env"
}
if [[ -n "$RESTORE_SOURCE" ]]; then
	write_env RESTORE_FROM "$RESTORE_SOURCE"
	write_env RESTORE_AT "$RESTORE_TIME"
	for key in S3_BUCKET S3_REGION S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_FORCE_PATH_STYLE; do
		write_env "$key" "${!key:-}"
	done
fi
chmod 600 "$DIR/.env"

log "Starting OpenRoom $VERSION..."
docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" up -d >&2
for _ in $(seq 1 90); do
	id="$(docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" ps -q app)"
	status="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
	[[ "$status" == "healthy" ]] && break
	sleep 2
done
if [[ "${status:-}" != "healthy" ]]; then
	die "OpenRoom did not start. See why with: openroom-server logs. After fixing it, start it with: docker compose --project-directory $DIR up -d. The first password is in $DIR/.env until the first successful start."
fi
if [[ -n "$RESTORE_SOURCE" ]]; then
	docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" exec -T app node src/launcher/tools.ts verify-restore >&2
	sed -i -e '/^RESTORE_FROM=/d' -e '/^RESTORE_AT=/d' -e '/^S3_/d' "$DIR/.env"
fi
sed -i '/^ADMIN_PASSWORD=/d' "$DIR/.env"
docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" up -d --no-deps app >&2
for _ in $(seq 1 90); do
	id="$(docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" ps -q app)"
	status="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
	[[ "$status" == "healthy" ]] && break
	sleep 2
done
[[ "${status:-}" == "healthy" ]] || die "OpenRoom did not restart after removing one-time credentials. See openroom-server logs. The original secret key is still in $DIR/.env."
if [[ -n "$RESTORE_SOURCE" ]]; then
	docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" exec -T app node src/launcher/tools.ts verify-restore >&2
fi

URL="https://$DOMAIN"
if [[ -n "$RESTORE_SOURCE" ]]; then
	if [[ "$JSON" == "1" ]]; then
		printf '{"ok":true,"restored":true,"url":"%s","dir":"%s","version":"%s"}\n' "$URL" "$DIR" "$VERSION"
	else
		log "OpenRoom restored at $URL. Sign in with the existing account. Keep the secret key and the old server stopped. Run openroom-server doctor to confirm backups."
	fi
elif [[ "$JSON" == "1" ]]; then
	printf '{"ok":true,"url":"%s","admin_email":"%s","admin_password":"%s","secret_key":"%s","dir":"%s","version":"%s"}\n' \
		"$URL" "$EMAIL" "$ADMIN_PASSWORD" "$SECRET_KEY" "$DIR" "$VERSION"
else
	cat <<DONE

OpenRoom is running at $URL
(the certificate can take a minute on the first visit)

Sign in:        $EMAIL
Password:       $ADMIN_PASSWORD
Secret key:     $SECRET_KEY

Save the password and the secret key now; they are shown only this once.
The secret key is needed to restore OpenRoom on a new server.
Check the install any time with: openroom-server doctor
DONE
fi
