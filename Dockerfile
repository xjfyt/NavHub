# syntax=docker/dockerfile:1.7

# ── Stage 1: Frontend builder ───────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend .
RUN npm run build

# ── Stage 2: Backend builder ────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM rust:1.95.0-bullseye AS backend-builder
ARG TARGETARCH
WORKDIR /app
COPY backend ./backend
WORKDIR /app/backend

RUN if [ "$TARGETARCH" = "arm64" ]; then \
        apt-get update && \
        apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu libc6-dev-arm64-cross && \
        rustup target add aarch64-unknown-linux-gnu; \
    fi

RUN --mount=type=cache,id=cargo-registry-${TARGETARCH},target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-target-${TARGETARCH},target=/app/backend/target \
    if [ "$TARGETARCH" = "arm64" ]; then \
        export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc && \
        export CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc && \
        export CXX_aarch64_unknown_linux_gnu=aarch64-linux-gnu-g++ && \
        cargo build --release --target aarch64-unknown-linux-gnu && \
        cp target/aarch64-unknown-linux-gnu/release/navhub /tmp/navhub; \
    else \
        cargo build --release && \
        cp target/release/navhub /tmp/navhub; \
    fi

# ── Final image ─────────────────────────────────────────────────────────────
# Stay on debian:bullseye-slim rather than distroless so `wget` is available
# for HEALTHCHECK without bundling a static curl. Run as a non-root UID so a
# container escape doesn't immediately get root on the host.
FROM debian:bullseye-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --shell /usr/sbin/nologin navhub
WORKDIR /app
COPY --from=backend-builder /tmp/navhub ./navhub
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY config.example.toml ./config.toml
RUN chown -R navhub:navhub /app
USER navhub
EXPOSE 8080
ENV NAVHUB_CONFIG="/app/config.toml"
# `/readyz` checks pg + redis liveness so the orchestrator only routes traffic
# when the dependencies are actually reachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://localhost:8080/readyz || exit 1
CMD ["./navhub"]
