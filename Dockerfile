# Frontend Build Stage
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* frontend/pnpm-lock.yaml* ./
# Use npm ci or pnpm install based on lockfile, here we use npm for safety
RUN npm install
COPY frontend .
RUN npm run build

# Backend Build Stage
FROM rust:1.79-bullseye AS backend-builder
WORKDIR /app
COPY backend ./backend
WORKDIR /app/backend
# Install dependencies, caching cargo registry
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/backend/target \
    cargo build --release && \
    cp target/release/navhub /app/navhub

# Final Production Image
FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy binaries and built assets
COPY --from=backend-builder /app/navhub ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY config.example.toml ./config.toml

# Expose port and configure environment
EXPOSE 8080
ENV NAVHUB_CONFIG="/app/config.toml"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

CMD ["./navhub"]
