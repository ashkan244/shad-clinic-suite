# Shad Clinic Suite

Dental-clinic platform. npm-workspaces monorepo.

## Layout
- `apps/api` — NestJS 11 + Prisma 6 (Postgres) + Redis. JWT auth.
- `apps/web` — React 19 + Vite + TanStack Query + React Router 7.

## Commands
- Dev (api+web): `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Prisma: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run seed`

## Conventions
- TypeScript + ESM (`"type": "module"`) everywhere.
- API: NestJS module/controller/service pattern; validate input with DTOs + class-validator.
- DB changes go through Prisma migrations only — never hand-written SQL.

## Working style (token discipline — Pro plan)
- Default to Sonnet. Opus runs only in plan mode (via `opusplan`) — use plan mode only for hard/architectural work, then exit fast.
- Delegate codebase search/exploration to the `explorer` agent (Haiku).
- Review with `/code-review` before commits; reserve Opus review for milestones.
- `/clear` between unrelated tasks. Keep this file lean (it loads every turn).
