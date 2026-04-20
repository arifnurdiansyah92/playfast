FROM node:22-slim AS base

# --- Dependencies + Build ---
FROM base AS builder
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/src/ ./src/
COPY frontend/public/ ./public/
COPY frontend/next.config.ts frontend/tsconfig.json frontend/postcss.config.mjs frontend/declarations.d.ts ./

# Install deps (postinstall needs src/assets for icon build)
RUN npm ci --legacy-peer-deps

# Build Next.js
ENV INTERNAL_API_URL=http://backend:5000
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV INTERNAL_API_URL=http://backend:5000

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 --no-create-home nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
