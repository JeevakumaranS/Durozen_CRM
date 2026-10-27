# Docker installation and deployment

The Docker Compose setup runs the frontend, backend, and PostgreSQL as separate
services. Both app images use multi-stage builds; the backend applies pending
Prisma migrations at startup and contains only production dependencies.
PostgreSQL data is persisted in the `postgres_data` volume and is not exposed on
a host port.

## Requirements and installation

Install Docker Desktop (Windows or macOS), or Docker Engine with the Docker
Compose plugin (Linux). Confirm that Docker is running and Compose is available:

```powershell
docker --version
docker compose version
```

From the repository root, create a private environment file:

```powershell
Copy-Item .env.docker.example .env.docker
```

On macOS/Linux, use `cp .env.docker.example .env.docker`.

Edit `.env.docker` before starting the services:

- Replace `POSTGRES_PASSWORD` with a long random password using letters and
  numbers, then use the same value in `DATABASE_URL`.
- Replace `JWT_SECRET` with a private random value of at least 32 characters.
- Keep `DATABASE_URL` pointed at the Compose service name `db`, not `localhost`.
- Set `WEB_ORIGIN` to the browser-visible frontend origin.
- `NEXT_PUBLIC_API_URL` is embedded in the frontend at image-build time. For
  local use, `http://localhost:4000/api` is correct; for deployment, set it to
  the publicly reachable API URL, including `/api`.

Do not commit `.env.docker` or put secrets in `NEXT_PUBLIC_*` variables.

Build and start all services from the repository root:

```powershell
docker compose --env-file .env.docker up --build -d
```

Compose waits for PostgreSQL to become healthy. The backend runs
`prisma migrate deploy` before starting the API. Visit `http://localhost:3000`.
The API is available at `http://localhost:4000/api`.

## Create the first administrator

After the stack is running and migrations have completed, create the
administrator interactively in the backend container:

```powershell
docker compose --env-file .env.docker run --rm --entrypoint node backend dist/admin/create-admin.js
```

Enter the administrator's full name, email, and a password of at least 12
characters twice. Password entry is hidden, and the password is stored as a
hash. The command connects to the same database as the backend. Sign in at
`http://localhost:3000/login`; an Admin is redirected to `/admin`. To recreate
an existing administrator's credentials, run the same command and use that
administrator's email. Do not create admin accounts through User Management,
which is for BDE and Sales Manager accounts only.

Useful commands:

```powershell
docker compose --env-file .env.docker logs -f
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker down
```

`down` preserves the database volume. To permanently remove the database data,
you must explicitly remove the `postgres_data` volume; do so only after taking
any required backups.

## Production notes

- Use a reverse proxy or managed ingress to provide HTTPS and route the public
  site/API to the frontend and backend services. Set `WEB_ORIGIN` and
  `NEXT_PUBLIC_API_URL` to the real public origins before building.
- The frontend API URL is compiled into its image. Rebuild the frontend image
  whenever that value changes.
- Keep `.env.docker` private and provide secrets through the deployment
  platform's secret manager where available.
- Back up PostgreSQL and test restoring backups. Do not publish the database
  port to the internet.
- For multi-replica deployments, prefer running migrations as a single release
  step before rolling out backend replicas rather than having every replica
  start concurrently.
- Create the initial administrator through the existing secure admin creation
  command in a trusted environment; do not bake admin credentials into an image.