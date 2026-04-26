#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/andrchq/reroller.git}"
APP_DIR="${APP_DIR:-/opt/reroller}"
APP_USER="${APP_USER:-reroller}"
APP_BRANCH="${APP_BRANCH:-main}"
APP_PORT="${APP_PORT:-4040}"
APP_SERVICE="${APP_SERVICE:-reroller-app}"
WORKER_SERVICE="${WORKER_SERVICE:-reroller-worker}"
CONFIG_FILE="${CONFIG_FILE:-/etc/reroller.conf}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash scripts/server-deploy.sh" >&2
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    echo "Install Node.js 24+, npm, git, PostgreSQL and Redis before deploy." >&2
    exit 1
  }
}

need_cmd git
need_cmd node
need_cmd npm
need_cmd systemctl

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 24 ]]; then
  echo "Node.js 24+ is required. Current: $(node -v)" >&2
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$APP_BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$APP_BRANCH"
  git -C "$APP_DIR" reset --hard "origin/${APP_BRANCH}"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

ENV_CREATED=0
if [[ ! -f "$APP_DIR/.env" ]]; then
  if [[ -f "$APP_DIR/.env.example" ]]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  else
    cat > "$APP_DIR/.env" <<EOF
DATABASE_URL="postgresql://reroller:change-me@localhost:5432/reroller?schema=public"
REDIS_URL="redis://localhost:6379"
APP_SECRET_KEY="change-me"
AUTH_SECRET="change-me"
NEXT_PUBLIC_APP_URL="http://localhost:${APP_PORT}"
EOF
  fi
  sed -i "s|NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=\"http://localhost:${APP_PORT}\"|" "$APP_DIR/.env"
  if [[ -n "${DEPLOY_DATABASE_URL:-}" ]]; then
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"${DEPLOY_DATABASE_URL}\"|" "$APP_DIR/.env"
  fi
  if [[ -n "${DEPLOY_REDIS_URL:-}" ]]; then
    sed -i "s|REDIS_URL=.*|REDIS_URL=\"${DEPLOY_REDIS_URL}\"|" "$APP_DIR/.env"
  fi
  if command -v openssl >/dev/null 2>&1; then
    APP_SECRET="$(openssl rand -hex 32)"
    AUTH_SECRET="$(openssl rand -hex 32)"
    sed -i "s|APP_SECRET_KEY=.*|APP_SECRET_KEY=\"${APP_SECRET}\"|" "$APP_DIR/.env"
    sed -i "s|AUTH_SECRET=.*|AUTH_SECRET=\"${AUTH_SECRET}\"|" "$APP_DIR/.env"
  fi
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  ENV_CREATED=1
  echo "Created $APP_DIR/.env."
fi

if [[ "$ENV_CREATED" -eq 1 && -z "${DEPLOY_DATABASE_URL:-}" ]]; then
  echo "Edit $APP_DIR/.env and set DATABASE_URL and REDIS_URL, then run this script again:"
  echo "  sudo bash $APP_DIR/scripts/server-deploy.sh"
  exit 0
fi

cat > "$CONFIG_FILE" <<EOF
APP_DIR="$APP_DIR"
APP_SERVICE="$APP_SERVICE"
WORKER_SERVICE="$WORKER_SERVICE"
APP_BRANCH="$APP_BRANCH"
EOF
chmod 644 "$CONFIG_FILE"

install -m 0755 "$APP_DIR/scripts/reroller" /usr/local/bin/reroller

cat > "/etc/systemd/system/${APP_SERVICE}.service" <<EOF
[Unit]
Description=Reroller Next.js panel
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=APP_PORT=${APP_PORT}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/env bash -lc 'npm run start -- -p "\${APP_PORT:-4040}"'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/${WORKER_SERVICE}.service" <<EOF
[Unit]
Description=Reroller BullMQ worker
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/env npm run worker
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_SERVICE" "$WORKER_SERVICE"

if command -v runuser >/dev/null 2>&1; then
  runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && npm ci && npm run prisma:generate && npx prisma migrate deploy && npm run build"
else
  su -s /bin/bash "$APP_USER" -c "cd '$APP_DIR' && npm ci && npm run prisma:generate && npx prisma migrate deploy && npm run build"
fi

systemctl restart "$APP_SERVICE" "$WORKER_SERVICE"

echo "Reroller deployed."
echo "Panel: http://SERVER_IP:${APP_PORT}"
echo "Manage with: reroller status | reroller logs | reroller update | reroller restart"
echo "Note: reroller update restarts the app only. Use reroller restart-worker when no active runs are working."
