#!/usr/bin/env bash
# NavHub 开发环境启动脚本
# - 检查 config.toml / PG / Redis
# - 并行启动后端 (cargo watch) 与前端 (vite dev)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

log() { printf "\033[36m[dev]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[dev]\033[0m %s\n" "$*"; }
err() { printf "\033[31m[dev]\033[0m %s\n" "$*" >&2; }

export NAVHUB_DEV=1

# --- Config ---
if [[ ! -f "config.toml" ]]; then
  if [[ -f "config.example.toml" ]]; then
    warn "config.toml 不存在,从 config.example.toml 拷贝"
    cp config.example.toml config.toml
  else
    err "缺少 config.toml,请先创建"
    exit 1
  fi
fi

# --- Dependencies ---
command -v cargo >/dev/null 2>&1 || { err "未找到 cargo"; exit 1; }
if ! command -v cargo-watch >/dev/null 2>&1; then
  warn "未检测到 cargo-watch,建议执行: cargo install cargo-watch"
fi

PKG_MGR="pnpm"
command -v pnpm >/dev/null 2>&1 || PKG_MGR="npm"

# --- Port Cleanup ---
log "检查端口占用 (8088, 5173)..."
for port in 8088 5173; do
  if command -v lsof >/dev/null 2>&1; then
    PIDS_TO_KILL=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [[ -n "$PIDS_TO_KILL" ]]; then
      warn "发现端口 $port 存在冲突，正在尝试优雅关闭..."
      echo "$PIDS_TO_KILL" | xargs kill 2>/dev/null || true
      sleep 3
      PIDS_ALIVE=$(lsof -ti tcp:"$port" 2>/dev/null || true)
      if [[ -n "$PIDS_ALIVE" ]]; then
        warn "端口 $port 依然被占用，强制终止..."
        echo "$PIDS_ALIVE" | xargs kill -9 2>/dev/null || true
      fi
    fi
  fi
done

# --- Frontend deps & build ---
if [[ ! -d "frontend/node_modules" ]]; then
  log "安装前端依赖 ($PKG_MGR)"
  (cd frontend && $PKG_MGR install)
fi

log "重新构建最新前端代码 (build)..."
rm -rf frontend/dist
(cd frontend && $PKG_MGR run build)

# --- Cleanup ---
PIDS=()
cleanup() {
  log "正在停止后台进程…"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- Backend ---
log "启动后端 (axum @ :8088)"
if command -v cargo-watch >/dev/null 2>&1; then
  (cd backend && cargo watch -q -c -w src -w migrations -w ../config.toml -x "run") &
else
  (cd backend && cargo run -q) &
fi
PIDS+=($!)

# --- Frontend ---
log "启动前端开发服务器 (vite @ :5173)"
(cd frontend && $PKG_MGR run dev) &
PIDS+=($!)

log "============================================="
log "🚀 NavHub 开发环境已就绪！"
log "🌐 开发访问 (热更新): http://127.0.0.1:5173"
log "🌐 原生后端服务: http://127.0.0.1:8088"
log "💡 (两者已通过最新的 build 保持同步)"
log "停止运行请按 Ctrl+C"
log "============================================="

wait
