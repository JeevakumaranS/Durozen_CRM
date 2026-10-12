# Durozen CRM

Sales lead and BDE management CRM for Durozen Technologies.

## Run locally

1. Install PostgreSQL locally and create a database named `durozen_crm`.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a private `JWT_SECRET`.
3. Install backend dependencies: `npm install --prefix backend`.
4. Install frontend dependencies: `npm install --prefix frontend`.
5. Apply the schema and generate Prisma Client: `npm run prisma:migrate --prefix backend` followed by `npm run prisma:generate --prefix backend`.
6. Seed the administrator: `npm run prisma:seed --prefix backend`.
7. Start the API: `npm run dev:backend`.
8. In a separate terminal, start the web app: `npm run dev:frontend`.

Open `http://localhost:3000`. The seeded admin login is `admin@durozen.com` / `ChangeMe123!`; change this password before use.

## Architecture

- `frontend`: Next.js responsive dashboard.
- `backend`: NestJS REST API with JWT authentication and RBAC, including the local PostgreSQL schema.

The API requires every active lead to have an assigned BDE, next action, and follow-up date. Docker is not required or used.
