FROM node:22-bookworm-slim AS deps

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM deps AS build

COPY frontend/ ./
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app/frontend

COPY --from=build --chown=node:node /app/frontend/.next-production/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next-production/static ./.next-production/static
COPY --from=build --chown=node:node /app/frontend/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]