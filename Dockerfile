FROM node:24.13.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npx vite build

FROM node:24.13.1-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server/
COPY --chown=node:node src/content/questions.ts ./src/content/questions.ts
COPY --chown=node:node src/content/avatar.ts ./src/content/avatar.ts
COPY --chown=node:node src/domain ./src/domain/
COPY --chown=node:node src/dynamic/domain.ts ./src/dynamic/domain.ts
COPY --chown=node:node src/dynamic/skills.ts ./src/dynamic/skills.ts
COPY --chown=node:node src/dynamic/profile-insights.ts ./src/dynamic/profile-insights.ts
COPY --chown=node:node src/dynamic/content-i18n.ts ./src/dynamic/content-i18n.ts
COPY --chown=node:node src/i18n/translate.ts ./src/i18n/translate.ts
RUN mkdir -p /app/data && chown node:node /app/data
RUN node -e "import('./server/app.mjs')"
ENV DATABASE_PATH=/app/data/academy.sqlite
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=5s --start-period=3s --start-interval=1s --retries=3 CMD ["node", "server/healthcheck.mjs"]
CMD ["node", "server/index.mjs"]
