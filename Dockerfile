# Render Docker-Service (bestehendes EnergyOne-Service auf main).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV RENDER=true
ENV VITE_AUTH_ENABLED=true
ENV PATH="/app/node_modules/.bin:${PATH}"
RUN node scripts/with-app-env.mjs vite build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV RENDER=true
ENV VITE_AUTH_ENABLED=true
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/public ./public
EXPOSE 10000
CMD ["sh", "-c", "mkdir -p \"${UPLOAD_DIR:-/var/data/uploads}\" && node scripts/migrate.mjs && exec node .output/server/index.mjs"]
