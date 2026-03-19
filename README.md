# grow-spiritually

Nx monorepo starter with:

- Angular frontend on [`apps/frontend`](/home/vibhor/projects/grow-spiritually/apps/frontend)
- NestJS backend on [`apps/backend`](/home/vibhor/projects/grow-spiritually/apps/backend)
- Prisma 7 configured for PostgreSQL

## Requirements

- Node.js available in your shell
- PostgreSQL running on `localhost:5432`

If Node is not already available in your WSL shell, load the installed `nvm`
environment first:

```sh
source ~/.nvm/nvm.sh
```

## Environment

The backend and Prisma use [`DATABASE_URL`](/home/vibhor/projects/grow-spiritually/.env.example).
The included local default is:

```sh
postgresql://postgres:postgres@localhost:5432/postgres?schema=public
```

Update `.env` if your Docker Postgres container uses different credentials or a
different database name.

## Run

Start both apps together:

```sh
npm run dev
```

This runs the Angular app and, through Nx, also starts the NestJS backend.

- Frontend health check UI: `http://localhost:4200`
- Backend health endpoint: `http://localhost:3000/api/health`

Start only the backend:

```sh
npm run dev:backend
```

## Prisma

Generate the client:

```sh
npm run prisma:generate
```

Create and apply a development migration:

```sh
npm run prisma:migrate:dev -- --name init
```

Open Prisma Studio:

```sh
npm run prisma:studio
```

## Notes

- The Angular app uses signals.
- The backend connects to Postgres through Prisma during Nest startup.
- The health endpoint is available at `GET /api/health`.
