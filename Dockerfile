# ── Stage 1: Frontend Builder ────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend .
RUN npm run build

# ── Stage 2: Backend Builder ─────────────────────────────────────────────────
FROM rust:1.95.0-bullseye AS backend-builder
WORKDIR /app
COPY backend ./backend
WORKDIR /app/backend
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/backend/target \
    cargo build --release && \
    cp target/release/navhub /tmp/navhub

# ── Target: frontend (nginx + SPA + API proxy) ────────────────────────────────
FROM nginx:alpine AS frontend
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_URL=http://navhub-backend:8080
EXPOSE 80

# ── Target: backend (API only, no frontend assets) ───────────────────────────
FROM debian:bullseye-slim AS backend
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-builder /tmp/navhub ./
COPY config.example.toml ./config.toml
EXPOSE 8080
ENV NAVHUB_CONFIG="/app/config.toml"
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1
CMD ["./navhub"]

# ── Default Target: all-in-one ────────────────────────────────────────────────
FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-builder /tmp/navhub ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY config.example.toml ./config.toml
EXPOSE 8080
ENV NAVHUB_CONFIG="/app/config.toml"
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1
CMD ["./navhub"]
