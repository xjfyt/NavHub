#!/usr/bin/env bash
#
# NavHub 数据库备份脚本 (OPS-13)
#
# 用 pg_dump 以自定义格式(-Fc,支持并行/选择性恢复)导出数据库,可选一并打包
# 上传目录。所有参数通过环境变量传入,可直接读取同目录 ../.env。
#
# 用法:
#   PG_PASSWORD=... ./scripts/backup.sh
#   BACKUP_DIR=/srv/backups RETENTION=14 ./scripts/backup.sh
#
# 环境变量(均有默认值,密码必填):
#   PG_HOST           数据库主机           (默认 localhost)
#   PG_PORT           数据库端口           (默认 5432)
#   PG_USER           数据库用户           (默认 navhub)
#   PG_PASSWORD       数据库密码           (必填)
#   PG_DATABASE       数据库名             (默认 navhub)
#   BACKUP_DIR        备份输出目录         (默认 ./backups)
#   RETENTION         保留最近多少份备份   (默认 7,设 0 不清理)
#   NAVHUB_UPLOADS_DIR 若设置则一并 tar 该上传目录(本地存储部署)
#   USE_DOCKER_COMPOSE 设为 1 则通过 `docker compose exec -T postgres` 执行 pg_dump
#
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 自动加载仓库根目录的 .env(若存在),便于复用 compose 的同一套凭据。
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
BACKUP_DIR="${BACKUP_DIR:-${here}/../backups}"
RETENTION="${RETENTION:-7}"
USE_DOCKER_COMPOSE="${USE_DOCKER_COMPOSE:-0}"

if [[ -z "${PG_PASSWORD:-}" ]]; then
  echo "错误:必须设置 PG_PASSWORD(或在 .env 中提供)。" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
ts="$(date +%Y%m%d-%H%M%S)"
out="${BACKUP_DIR}/navhub-db-${ts}.dump"

echo "==> 备份数据库 ${PG_DATABASE}@${PG_HOST}:${PG_PORT} -> ${out}"
if [[ "${USE_DOCKER_COMPOSE}" == "1" ]]; then
  # compose 部署:在 postgres 容器内执行,无需宿主装 pg_dump。
  PGPASSWORD="${PG_PASSWORD}" docker compose exec -T postgres \
    pg_dump -U "${PG_USER}" -d "${PG_DATABASE}" -Fc > "${out}"
else
  PGPASSWORD="${PG_PASSWORD}" pg_dump \
    -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DATABASE}" \
    -Fc -f "${out}"
fi
echo "==> 数据库备份完成:$(du -h "${out}" | cut -f1)"

# 可选:打包本地上传目录(对象存储部署请改用桶级备份/版本控制)。
if [[ -n "${NAVHUB_UPLOADS_DIR:-}" && -d "${NAVHUB_UPLOADS_DIR}" ]]; then
  uploads_out="${BACKUP_DIR}/navhub-uploads-${ts}.tar.gz"
  echo "==> 打包上传目录 ${NAVHUB_UPLOADS_DIR} -> ${uploads_out}"
  tar -czf "${uploads_out}" -C "$(dirname "${NAVHUB_UPLOADS_DIR}")" "$(basename "${NAVHUB_UPLOADS_DIR}")"
  echo "==> 上传目录备份完成:$(du -h "${uploads_out}" | cut -f1)"
fi

# 保留策略:按修改时间删除超过 RETENTION 份的旧 .dump。
if [[ "${RETENTION}" -gt 0 ]]; then
  echo "==> 清理:仅保留最近 ${RETENTION} 份数据库备份"
  mapfile -t old < <(ls -1t "${BACKUP_DIR}"/navhub-db-*.dump 2>/dev/null | tail -n "+$((RETENTION + 1))")
  for f in "${old[@]:-}"; do
    [[ -n "${f}" ]] || continue
    echo "    删除旧备份 ${f}"
    rm -f "${f}"
  done
fi

echo "==> 全部完成。"
