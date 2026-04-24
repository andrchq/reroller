# Reroller

Private Next.js panel for Selectel Floating IP allocation.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- PostgreSQL + Prisma
- Redis + BullMQ worker
- AES-GCM encrypted provider and Telegram secrets
- SSE live logs

## Local Run Without Docker

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Set `DATABASE_URL` in `.env` to your local PostgreSQL database. Redis is still required for background jobs; set `REDIS_URL` to your local Redis instance.

In another terminal run the worker:

```bash
npm run worker
```

Open `http://localhost:4040`, create the first admin, add a Selectel account, sync projects, create a profile, and start a run.

## Docker

Docker is only needed for server-style deployment or when you want local infrastructure containers. Set `APP_SECRET_KEY` and `AUTH_SECRET`, then run:

```bash
docker compose up --build
```

## Server Deploy From GitHub

The Linux server flow uses `systemd` and a single management command named `reroller`.

Requirements on the server:

- Ubuntu/Debian with `systemd`
- Node.js 24+
- npm
- git
- PostgreSQL
- Redis

Initial deploy:

```bash
git clone https://github.com/andrchq/reroller.git /tmp/reroller
cd /tmp/reroller
sudo bash scripts/server-deploy.sh
```

On the first run the script creates `/opt/reroller/.env` and stops if `DATABASE_URL` was not provided. Fill the file and run deploy again:

```bash
sudo nano /opt/reroller/.env
sudo bash /opt/reroller/scripts/server-deploy.sh
```

Non-interactive deploy with database and Redis URLs:

```bash
sudo DEPLOY_DATABASE_URL="postgresql://user:pass@localhost:5432/reroller?schema=public" \
  DEPLOY_REDIS_URL="redis://localhost:6379" \
  bash scripts/server-deploy.sh
```

Defaults:

- repository: `https://github.com/andrchq/reroller.git`
- install path: `/opt/reroller`
- app port: `4040`
- app service: `reroller-app`
- worker service: `reroller-worker`
- config: `/etc/reroller.conf`

After deploy, edit server secrets:

```bash
sudo nano /opt/reroller/.env
sudo reroller restart
```

Useful commands:

```bash
reroller status
reroller logs
reroller logs-app
reroller logs-worker
reroller restart
reroller stop
reroller start
```

Update from GitHub, install dependencies, apply Prisma migrations, build, and restart:

```bash
sudo reroller update
```

Override deploy defaults when needed:

```bash
sudo APP_DIR=/srv/reroller APP_PORT=4040 APP_BRANCH=main bash scripts/server-deploy.sh
```

## Caddy Reverse Proxy

Caddy can issue HTTPS certificates automatically and proxy the public domain to the local Next.js app on port `4040`.

Before running this, make sure:

- DNS `A` record for `ps.prsta.xyz` points to the server IPv4 address.
- DNS `AAAA` record is either correct or absent.
- Ports `80` and `443` are open in the server firewall and provider firewall.

Install and configure Caddy:

```bash
cd /opt/reroller
sudo DOMAIN=ps.prsta.xyz UPSTREAM=127.0.0.1:4040 bash scripts/setup-caddy.sh
```

Optional ACME email:

```bash
sudo DOMAIN=ps.prsta.xyz ACME_EMAIL=admin@prsta.xyz bash scripts/setup-caddy.sh
```

Check Caddy:

```bash
systemctl status caddy
journalctl -u caddy -f
```

After Caddy is ready, set:

```env
NEXT_PUBLIC_APP_URL="https://ps.prsta.xyz"
```

Then restart the app:

```bash
sudo reroller restart
```

## Selectel Flow

The worker authenticates with Selectel IAM, creates a Floating IP for the selected project and region, compares the returned address with profile targets, keeps matched IPs, and deletes misses immediately.
