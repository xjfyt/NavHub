# syntax=docker/dockerfile:1.7

# ── Stage 1: Frontend builder ───────────────────────────────────────────────
# OPS-6 供应链加固:基础镜像已固定到具体版本标签(非 latest)。如需完全可复现,
# 进一步固定到不可变摘要:`FROM node:20-alpine@sha256:<digest>`。获取摘要:
#   docker buildx imagetools inspect node:20-alpine --format '{{.Manifest.Digest}}'
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json ./
# 锁文件在 Windows 生成,npm ci/install 沿用它时会触发 npm 跨平台 optionalDependencies
# 安装缺陷(npm/cli#4828),漏装 linux 的 rollup/esbuild 原生二进制导致 build 失败。
# 故此处不带锁文件、用 npm install 按本平台(musl)全新解析安装正确原生包——这正是
# npm 报错信息建议的官方规避方式。版本范围由 package.json 约束。
RUN npm install --no-audit --no-fund
COPY frontend .
RUN npm run build

# ── Stage 2: Backend builder ────────────────────────────────────────────────
# OPS-6:版本已固定;如需摘要固定 `rust:1.95.0-bullseye@sha256:<digest>`。
FROM --platform=$BUILDPLATFORM rust:1.95.0-bullseye AS backend-builder
ARG TARGETARCH
WORKDIR /app
COPY backend ./backend
WORKDIR /app/backend

RUN if [ "$TARGETARCH" = "arm64" ]; then \
        apt-get -o Acquire::Retries=5 update && \
        apt-get -o Acquire::Retries=5 install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu libc6-dev-arm64-cross && \
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
# Stay on debian slim rather than distroless so `wget` is available for
# HEALTHCHECK without bundling a static curl. Bookworm (not bullseye):
# deb.debian.org/security.debian.org for bullseye frequently 502 in CI/dev
# builders. Run as a non-root UID so a container escape doesn't immediately
# get root on the host.
# OPS-6:如需摘要固定 `debian:bookworm-slim@sha256:<digest>`(运行期镜像最值得固定)。
FROM debian:bookworm-slim
# Avoid a hard dependency on deb.debian.org (this builder often 502s the
# bookworm/bullseye InRelease). Rewrite only the main debian URI, keep
# security.debian.org, and retry apt-get update.
RUN set -eux; \
    printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's|^URIs: https\?://deb.debian.org/debian$|URIs: http://ftp.debian.org/debian|' /etc/apt/sources.list.d/debian.sources; \
    fi; \
    ok=0; i=1; \
    while [ "$i" -le 6 ]; do \
      if apt-get update; then ok=1; break; fi; \
      i=$((i+1)); sleep $((i)); \
    done; \
    test "$ok" = 1; \
    apt-get install -y --no-install-recommends ca-certificates wget; \
    rm -rf /var/lib/apt/lists/*; \
    useradd --system --uid 10001 --shell /usr/sbin/nologin navhub
WORKDIR /app
COPY --from=backend-builder /tmp/navhub ./navhub
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY config.example.toml ./config.toml
RUN chown -R navhub:navhub /app
USER navhub
EXPOSE 8088
ENV NAVHUB_CONFIG="/app/config.toml"
# `/api/readyz` checks pg + redis liveness so the orchestrator only routes
# traffic when the dependencies are actually reachable. Port matches
# config.example.toml's [server].port; override `NAVHUB__SERVER__PORT` and
# the operator must also override this HEALTHCHECK.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://localhost:8088/api/readyz || exit 1
CMD ["./navhub"]
