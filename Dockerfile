# ── Build stage: install only production deps ────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# Copy package.json and package-lock.json for deterministic installs
COPY package.json package-lock.json* ./
# Install only production dependencies and clean cache to save space
RUN npm ci --omit=dev && npm cache clean --force

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Use non-root user for better security
USER node

# Copy deps from build stage
COPY --chown=node:node --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=node:node server/ ./server/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.js"]
