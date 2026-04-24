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

## Selectel Flow

The worker authenticates with Selectel IAM, creates a Floating IP for the selected project and region, compares the returned address with profile targets, keeps matched IPs, and deletes misses immediately.
