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

## Selectel Flow

The worker authenticates with Selectel IAM, creates a Floating IP for the selected project and region, compares the returned address with profile targets, keeps matched IPs, and deletes misses immediately.
