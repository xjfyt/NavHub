#!/usr/bin/env bash
#
# NavHub 数据库恢复脚本 (OPS-13)
#
# 从 backup.sh 生成的自定义格式转储(-Fc .dump)恢复数据库。这是破坏性操作:
# 会覆盖目标库中同名对象,务必先确认目标环境与备份文件。
#
# 用法:
#   PG_PASSWORD=... ./scripts/restore.sh /path/to/navhub-db-YYYYmmdd-HHMMSS.dump
#   FORCE=1 ... ./scripts/restore.sh <dump>     # 跳过交互确认(用于自动化)
#
# 环境变量同 backup.sh(PG_HOST/PORT/USER/PASSWORD/DATABASE、USE_DOCKER_COMPOSE)。
#
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${here}/../.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${here}/../.env"
  set +a
fi

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-navhub}"
PG_DATABASE="${PG_DATABASE:-navhub}"
USE_DOCKER_COMPOSE="${USE_DOCKER_COMPOSE:-0}"

dump="${1:-}"
if [[ -z "${dump}" ]]; then
  echo "用法:$0 <备份文件.dump>" >&2
  exit 2
fi
if [[ ! -f "${dump}" ]]; then
  echo "错误:找不到备份文件 ${dump}" >&2
  exit 2
fi
if [[ -z "${PG_PASSWORD:-}" ]]; then
  echo "错误:必须设置 PG_PASSWORD(或在 .env 中提供)。" >&2
  exit 1
fi

echo "!! 即将把 ${dump} 恢复到 ${PG_DATABASE}@${PG_HOST}:${PG_PORT}"
echo "!! 这会覆盖目标库中的现有数据。请确认目标环境正确。"
if [[ "${FORCE:-0}" != "1" ]]; then
  read -r -p "输入数据库名 '${PG_DATABASE}' 以确认继续:" answer
  if [[ "${answer}" != "${PG_DATABASE}" ]]; then
    echo "已取消(输入不匹配)。"
    exit 1
  fi
fi

echo "==> 开始恢复…"
# --clean --if-exists 先删后建,保证可重复恢复;-1 单事务,失败则整体回滚。
if [[ "${USE_DOCKER_COMPOSE}" == "1" ]]; then
  PGPASSWORD="${PG_PASSWORD}" docker compose exec -T postgres \
    pg_restore -U "${PG_USER}" -d "${PG_DATABASE}" --clean --if-exists -1 < "${dump}"
else
  PGPASSWORD="${PG_PASSWORD}" pg_restore \
    -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DATABASE}" \
    --clean --if-exists -1 "${dump}"
fi

echo "==> 恢复完成。请重启 navhub 并验证登录 / 数据完整性。"
