FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci

FROM deps AS build

COPY backend/nest-cli.json backend/tsconfig*.json ./
COPY backend/src ./src
RUN npm run build \
  && npx tsc --target ES2022 --module commonjs --moduleResolution node \
    --esModuleInterop --skipLibCheck --outDir dist/admin prisma/create-admin.ts

FROM base AS prod-deps

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci --omit=dev

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app/backend

COPY --from=prod-deps --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --chown=node:node backend/prisma/schema.prisma ./prisma/schema.prisma
COPY --chown=node:node backend/prisma/migrations ./prisma/migrations

USER node

EXPOSE 4000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]

# Admin CLI stage
FROM build AS admin-cli

CMD ["npx", "ts-node", "prisma/create-admin.ts"]