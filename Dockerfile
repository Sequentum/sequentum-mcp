# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files. pnpm-workspace.yaml holds the allowBuilds list, so only the
# dependencies named there may run install scripts.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Stamp the release version into package.json when the build supplies one. The
# server reads its version from package.json at runtime, so this is what /health
# and the MCP serverInfo.version end up reporting. Without the build arg the file
# is left untouched and a plain `docker build` keeps working. pnpm-lock.yaml
# holds no version, so stamping it after the lockfile was written is safe.
ARG VERSION
RUN if [ -n "$VERSION" ]; then \
      apk add --no-cache jq \
      && jq --arg v "$VERSION" '.version = $v' package.json > package.tmp \
      && mv package.tmp package.json; \
    fi

# Install all dependencies (including dev for build), exactly as pnpm-lock.yaml says.
# Corepack fetches the pnpm version named in package.json's packageManager field.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN pnpm exec tsc

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy the (possibly version-stamped) package files from the builder stage rather
# than from the build context, so both stages agree on the version, and install
# production dependencies only. The pnpm store and the pnpm and Corepack caches are
# deleted afterwards to keep the image small.
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && pnpm install --frozen-lockfile --prod \
    && rm -rf "$(pnpm store path)" /root/.cache

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose the port
EXPOSE 3000

# Run as non-root user for security
USER node

# Health check (uses PORT env var for flexibility)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the server
CMD ["node", "dist/index.js"]
