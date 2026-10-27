# Durozen CRM

Sales lead and BDE management CRM for Durozen Technologies.

## Run locally

1. Install PostgreSQL locally and create a database named `crm` (matching `backend/.env.example`).
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a private `JWT_SECRET`. Configure JWT lifetime with `JWT_EXPIRES_IN_MINUTES` (positive whole minutes; defaults to 480).
3. Install backend dependencies: `npm install --prefix backend`.
4. Install frontend dependencies: `npm install --prefix frontend`.
5. Apply pending, non-destructive Prisma migrations and generate Prisma Client: `npm run prisma:migrate --prefix backend` followed by `npm run prisma:generate --prefix backend`. The team migration adds nullable `users.manager_id`; it does not backfill or reassign existing users or leads.
6. Create an administrator securely from an interactive terminal: `npm run admin:create --prefix backend`. Enter a full name and email, then a password of at least 12 characters twice. Password entry is hidden and the password is stored as a hash.
7. From the `frontend` directory, start the API with `npm run dev:backend`.
8. In a separate terminal, from the `frontend` directory, start the web app with `npm run dev`.

## Install with Docker

Install Docker Desktop (or Docker Engine with the Compose plugin), then from the repository root:

1. Copy the Docker environment template: `Copy-Item .env.docker.example .env.docker` (PowerShell), or `cp .env.docker.example .env.docker` (macOS/Linux).
2. Edit `.env.docker`. Set a long random `POSTGRES_PASSWORD` and use the same value in `DATABASE_URL`; set a private `JWT_SECRET` of at least 32 characters. For local use, keep `DATABASE_URL` pointed at `db` and `NEXT_PUBLIC_API_URL` at `http://localhost:4000/api`.
3. Build and start the database, API, and web app: `docker compose --env-file .env.docker up --build -d`.
4. After the backend has completed its startup migrations, create the first administrator interactively:

   ```powershell
   docker compose --env-file .env.docker run --rm --entrypoint node backend dist/admin/create-admin.js
   ```

   Enter the administrator's name and email, then a password of at least 12 characters twice. Password entry is hidden. Open `http://localhost:3000/login` and sign in with those credentials. The command connects to the same database used by the running API.

See [DOCKER.md](./DOCKER.md) for Docker configuration, useful Compose commands, and production deployment notes. Do not commit `.env.docker` or place secrets in `NEXT_PUBLIC_*` variables.

Open `http://localhost:3000/login` and sign in with the account's email and password. The backend determines the role and redirects ADMIN users to `/admin`; BDE and Sales Manager users use the existing `/dashboard` route. Admin accounts can only be provisioned using `npm run admin:create --prefix backend`; Admin → User Management creates BDE and Sales Manager accounts only. JWTs remain valid until their configured expiry after logout or password changes; expired tokens prompt a sign-in alert, and deactivated accounts are rejected on authenticated requests.

Admin assigns each BDE to one active Sales Manager in **Admin → User Management**. Existing BDEs remain unassigned after migration until an Admin maps them; their leads stay assigned to the same BDE and become visible to that BDE's manager only after assignment. Managers can view and assign leads within their own team, and all team dashboards, reports, follow-ups, and proposals are scoped to that mapping.

Sales Managers use the team-scoped `/dashboard`, `/leads`, `/pipeline`, `/follow-ups`, `/proposals`, `/performance`, and `/reports` routes. Lead assignment and reassignment are available inline in the Leads list and only offer active BDEs assigned to the signed-in manager. Moving a lead from New Lead to Contacted or from Contacted to Interested requires contact and qualification details; these are saved to the lead and its activity history. Admin report and monthly-summary selection is available on `/admin`; these items and Settings are omitted from the Admin workspace navigation. Admin-only settings and user-management routes are not available to managers.

## Architecture

- `frontend`: Next.js responsive dashboard.
- `backend`: NestJS REST API with JWT authentication and RBAC, including the local PostgreSQL schema.
- `/login`: shared login for all three roles.
- `/admin`: dedicated, ADMIN-only dashboard using the existing PostgreSQL user, lead, follow-up, and sales records.

The API requires every active lead to have an assigned BDE, next action, and follow-up date. You can run the app locally or use the Docker Compose setup described above.

Meetings support scheduled, completed, and cancelled history. Rescheduling updates the existing meeting and records the previous time in the lead activity history. Meeting lifecycle records are scoped through the associated lead; the meeting lifecycle migration preserves existing meetings as scheduled and does not backfill historical activity or follow-up associations.
