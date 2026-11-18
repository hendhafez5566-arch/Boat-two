FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .

FROM dependencies AS api
RUN pnpm --filter api build && mkdir -p /data/uploads && chown node:node /data/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM dependencies AS web
ARG PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$PUBLIC_API_URL
RUN pnpm --filter web build
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
