# 一、NavHub Deployment & Operations Guide

> **对应代码**：`Dockerfile`、`docker-compose.yaml`、`config.example.toml`
> **维护提示**：部署配置变更时同步更新本文档。

本文档提供有关在生产环境中安全、高效部署和运维 NavHub 的补充指南。特别是应对日志、存储路径、容灾手段与备份策略。

## 1、前端静态资源目录

NavHub 将不会在宿主机随意搜寻备用的构建产出，请您务必确保在 `config.toml` 中配置了正确的 `dist_dir` 挂载路径。如果在 Docker 容器内部署，我们建议配置指向 `/app/frontend/dist` 并在启动容器时确保存有该内容。
- `assets/` 下的 CSS/JS 资源已经绑定了为期 1 年的 `max-age=31536000` 防并发缓存；
- `index.html` 指定了 `no-cache` 以保证随时能更迭系统主轴入口。

## 2、系统日志说明

为了贴合物联和微服务的部署架构，NavHub **拒绝在应用层面做复杂的日滚轮转。**
后台网关通过 `tracing_subscriber` 所有日志一律被派送往标配的标准输出（`stdout`）。
**推荐的收集方式**：让系统由 `systemd` (通过 `journalctl`) 或在 Kubernetes 等容器调度中通过 `Fluentd / ELK` 进行按需接管截获并自动轮转和保存。

## 3、文件上传路径卷权限

NavHub 的全部上传（包括图标库、个人头像等）受系统级的重叠扫描保护不再会产生所谓的“孤儿文件”，如果文件在库内具有同一个 SHA-256 哈希会被去重。
如果是 Local 部署而非 S3，建议：
- 暴露 `/uploads` 到一个独立的高速 IO 存储卷 (Volume)。
- 请勿向外部容器分享写入和修改权限，以免产生未授权的越权或病毒混入。

## 4、数据库冷备份方案

NavHub 强烈依赖 PostgreSQL 与 Redis。虽然 Redis 重启丢数据顶多引起会话过期重登录，但 PG 的掉线可能会导致全盘资产覆灭。我们强烈提出按天为维度的冷备份预警机制：

### 4.1 自动化执行 `pg_dump`

设定定时 CronJob：
```bash
0 2 * * * PGPASSWORD="your_pg_password" pg_dump -h <db_host> -U <db_user> -d <database_name> -F c -f "/backup/navhub_$(date +\%Y\%m\%d).dump"
```

建议同时挂载 S3 AWS CLI / Rclone 工具，在上述代码完成后推送异地云：
```bash
aws s3 cp /backup/navhub_$(date +\%Y\%m\%d).dump s3://your-backup-bucket/navhub/
```

### 4.2 归档与轮询清理保留期

如需保留近 30 天：
```bash
find /backup/ -type f -name "navhub_*.dump" -mtime +30 -exec rm {} \;
```

## 5、核心崩溃下的保障

请注意：当前 NavHub 在缺失 Redis 且不提供 fallback 情况下执行“严阵以待”拦截（500 Service Error），因为这是强保证会话一致性和安全的手段，不要妄加弱化代理校验组件。

---
- 上一篇：（无，这是首篇）
- 下一篇：[02-backup-restore.md](./02-backup-restore.md)
- 返回索引：[docs/README.md](../README.md)# NavHub Deployment & Operations Guide

本文档提供有关在生产环境中安全、高效部署和运维 NavHub 的补充指南。特别是应对日志、存储路径、容灾手段与备份策略。

## 1. 前端静态资源目录 (6.1)
NavHub 将不会在宿主机随意搜寻备用的构建产出，请您务必确保在 `config.toml` 中配置了正确的 `dist_dir` 挂载路径。如果在 Docker 容器内部署，我们建议配置指向 `/app/frontend/dist` 并在启动容器时确保存有该内容。
- `assets/` 下的 CSS/JS 资源已经绑定了为期 1 年的 `max-age=31536000` 防并发缓存；
- `index.html` 指定了 `no-cache` 以保证随时能更迭系统主轴入口。

## 2. 系统日志说明 (6.3)
为了贴合物联和微服务的部署架构，NavHub **拒绝在应用层面做复杂的日滚轮转。**
后台网关通过 `tracing_subscriber` 所有日志一律被派送往标配的标准输出（`stdout`）。
**推荐的收集方式**：让系统由 `systemd` (通过 `journalctl`) 或在 Kubernetes 等容器调度中通过 `Fluentd / ELK` 进行按需接管截获并自动轮转和保存。

## 3. 文件上传路径卷权限 (6.6)
NavHub 的全部上传（包括图标库、个人头像等）受系统级的重叠扫描保护不再会产生所谓的“孤儿文件”，如果文件在库内具有同一个 SHA-256 哈希会被去重。
如果是 Local 部署而非 S3，建议：
- 暴露 `/uploads` 到一个独立的高速 IO 存储卷 (Volume)。
- 请勿向外部容器分享写入和修改权限，以免产生未授权的越权或病毒混入。

## 4. 数据库冷备份方案 (6.7)
NavHub 强烈依赖 PostgreSQL 与 Redis。虽然 Redis 重启丢数据顶多引起会话过期重登录，但 PG 的掉线可能会导致全盘资产覆灭。我们强烈提出按天为维度的冷备份预警机制：

### 自动化执行 `pg_dump`
设定定时 CronJob：
```bash
0 2 * * * PGPASSWORD="your_pg_password" pg_dump -h <db_host> -U <db_user> -d <database_name> -F c -f "/backup/navhub_$(date +\%Y\%m\%d).dump"
```
建议同时挂载 S3 AWS CLI / Rclone 工具，在上述代码完成后推送异地云：
```bash
aws s3 cp /backup/navhub_$(date +\%Y\%m\%d).dump s3://your-backup-bucket/navhub/
```

### 归档与轮询清理保留期
如需保留近 30 天：
```bash
find /backup/ -type f -name "navhub_*.dump" -mtime +30 -exec rm {} \;
```

## 5. 核心崩溃下的保障 (6.5)
请注意：当前 NavHub 在缺失 Redis 且不提供 fallback 情况下执行“严阵以待”拦截（500 Service Error），因为这是强保证会话一致性和安全的手段，不要妄加弱化代理校验组件。
