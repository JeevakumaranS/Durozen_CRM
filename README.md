# Durozen CRM

Sales lead and BDE management CRM for Durozen Technologies.

## Run locally

1. Install PostgreSQL locally and create a database named `crm` (matching `backend/.env.example`).
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a private `JWT_SECRET`. Configure JWT lifetime with `JWT_EXPIRES_IN_MINUTES` (positive whole minutes; defaults to 480).
3. Install backend dependencies: `npm install --prefix backend`.
4. Install frontend dependencies: `npm install --prefix frontend`.
5. Apply pending, non-destructive Prisma migrations and generate Prisma Client: `npm run prisma:migrate --prefix backend` followed by `npm run prisma:generate --prefix backend`. The team migration adds nullable `users.manager_id`; it does not backfill or reassign existing users or leads.
6. Seed the local sample dataset with `npm run prisma:reset-seed --prefix backend`. This clears all CRM table data while preserving the schema and migration history. Demo Manager/BDE accounts use `DemoPass123!`.
7. Create an administrator securely from an interactive terminal: `npm run admin:create --prefix backend`. The password is entered without echo and is never stored in source code.
8. From the `frontend` directory, start the API with `npm run dev:backend`.
9. In a separate terminal, from the `frontend` directory, start the web app with `npm run dev`.

Open `http://localhost:3000/login` and sign in with the account's email and password. The backend determines the role and redirects ADMIN users to `/admin`; BDE and Sales Manager users use the existing `/dashboard` route. Admin accounts can only be provisioned using `npm run admin:create --prefix backend`; Admin → User Management creates BDE and Sales Manager accounts only. JWTs remain valid until their configured expiry after logout or password changes; expired tokens prompt a sign-in alert, and deactivated accounts are rejected on authenticated requests.

Admin assigns each BDE to one active Sales Manager in **Admin → User Management**. Existing BDEs remain unassigned after migration until an Admin maps them; their leads stay assigned to the same BDE and become visible to that BDE's manager only after assignment. Managers can view and assign leads within their own team, and all team dashboards, reports, follow-ups, and proposals are scoped to that mapping.

Sales Managers use the team-scoped `/dashboard`, `/leads`, `/pipeline`, `/follow-ups`, `/proposals`, `/performance`, and `/reports` routes. Lead assignment and reassignment are available inline in the Leads list and only offer active BDEs assigned to the signed-in manager. Moving a lead from New Lead to Contacted or from Contacted to Interested requires contact and qualification details; these are saved to the lead and its activity history. Admin report and monthly-summary selection is available on `/admin`; these items and Settings are omitted from the Admin workspace navigation. Admin-only settings and user-management routes are not available to managers.

## Architecture

- `frontend`: Next.js responsive dashboard.
- `backend`: NestJS REST API with JWT authentication and RBAC, including the local PostgreSQL schema.
- `/login`: shared login for all three roles.
- `/admin`: dedicated, ADMIN-only dashboard using the existing PostgreSQL user, lead, follow-up, and sales records.

The API requires every active lead to have an assigned BDE, next action, and follow-up date. Docker is not required or used.

Meetings support scheduled, completed, and cancelled history. Rescheduling updates the existing meeting and records the previous time in the lead activity history. Meeting lifecycle records are scoped through the associated lead; the meeting lifecycle migration preserves existing meetings as scheduled and does not backfill historical activity or follow-up associations.
