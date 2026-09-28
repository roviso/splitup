# ---- build web + bundle api ----
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm test && npm run build

# ---- runtime: one small node process serving API + web ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 WEB_DIST=/app/public MIGRATIONS_DIR=/app/drizzle
COPY --from=build /src/apps/api/dist/index.cjs ./index.cjs
COPY --from=build /src/apps/api/drizzle ./drizzle
COPY --from=build /src/apps/web/dist ./public
USER node
EXPOSE 3000
CMD ["node", "index.cjs"]
