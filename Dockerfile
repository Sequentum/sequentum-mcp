# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Stamp the release version into package.json (and package-lock.json) when the
# build supplies one. The server reads its version from package.json at runtime,
# so this is what /health and the MCP serverInfo.version end up reporting.
# Without the build arg the files are left untouched and a plain `docker build`
# keeps working. Must run before `npm ci` so the lock file stays consistent.
ARG VERSION
RUN if [ -n "$VERSION" ]; then \
      npm version "$VERSION" --no-git-tag-version --allow-same-version --ignore-scripts; \
    fi

# Install all dependencies (including dev for build)
# Skip prepare script - we'll build after copying source
RUN npm ci --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc && chmod +x dist/index.js

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy the (possibly version-stamped) package files from the builder stage rather
# than from the build context, so both stages agree on the version, and install
# production dependencies only
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production
ENV TRANSPORT_MODE=http
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
