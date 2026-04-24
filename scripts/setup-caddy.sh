#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-ps.prsta.xyz}"
UPSTREAM="${UPSTREAM:-127.0.0.1:4040}"
ACME_EMAIL="${ACME_EMAIL:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash scripts/setup-caddy.sh" >&2
  exit 1
fi

if ! command -v caddy >/dev/null 2>&1; then
  apt update
  apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  chmod o+r /etc/apt/sources.list.d/caddy-stable.list
  apt update
  apt install -y caddy
fi

if [[ -n "$ACME_EMAIL" ]]; then
  cat > /etc/caddy/Caddyfile <<EOF
{
	email ${ACME_EMAIL}
}

${DOMAIN} {
	encode zstd gzip
	reverse_proxy ${UPSTREAM}
}
EOF
else
  cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode zstd gzip
	reverse_proxy ${UPSTREAM}
}
EOF
fi

caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

echo "Caddy is configured."
echo "Domain: https://${DOMAIN}"
echo "Upstream: http://${UPSTREAM}"
echo "Make sure DNS A/AAAA records point ${DOMAIN} to this server and ports 80/443 are open."
