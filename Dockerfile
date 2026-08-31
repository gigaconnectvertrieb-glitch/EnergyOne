# Render Docker-Service (bestehendes EnergyOne-Service).
# Runtime bleibt Docker — kein neues Native-Node-Service nötig.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV RENDER=true
ENV VITE_AUTH_ENABLED=true
RUN node scripts/with-app-env.mjs vite build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV RENDER=true
ENV VITE_AUTH_ENABLED=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/public ./public
EXPOSE 10000
CMD ["sh", "-c", "mkdir -p \"${UPLOAD_DIR:-/var/data/uploads}\" && node scripts/migrate.mjs && exec node .output/server/index.mjs"]
