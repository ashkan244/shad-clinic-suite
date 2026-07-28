# Shad Clinic Suite

Production-ready foundation for the Shad dental clinic platform.

## Stack

- Web: React + Vite + TypeScript
- API: NestJS + Prisma
- Data: PostgreSQL + Redis
- Deploy: Docker Compose on an Iran VPS

## Local setup

1. Copy `.env.example` to `.env`
2. Run `docker compose up -d`
3. Install dependencies with `npm install`
4. Generate the Prisma client and create/apply migrations: `npm run prisma:generate` then `npm run prisma:migrate` (creates a committed migration under `apps/api/prisma/migrations`)
5. Run `npm run dev`

## Production deploy

1. Set `JWT_SECRET` and production database credentials in `docker-compose.prod.yml`
2. Run `npm run docker:prod:build`
3. Run `npm run docker:prod:up`
4. Seed data with `npm run seed`

The API container applies schema migrations automatically on start (`prisma migrate deploy`),
so the `apps/api/prisma/migrations` folder must be committed for production to reproduce the schema.
