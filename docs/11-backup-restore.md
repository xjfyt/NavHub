# 备份与恢复运行手册 (OPS-13)

本手册说明 NavHub 的数据备份、恢复与演练流程。需要持久化的状态有两类:

1. **PostgreSQL 数据库** —— 用户、分组、图标、偏好、消息等全部业务数据。
2. **对象 / 上传存储** —— 头像、上传的图标、壁纸等二进制资产。
   - 使用 S3 / 兼容对象存储:依赖桶的**版本控制 + 跨区域复制**,无需脚本备份。
   - 使用本地存储:用 `scripts/backup.sh` 的 `NAVHUB_UPLOADS_DIR` 一并打包。

Redis 仅作缓存/限流,**无需备份**(丢失后自动重建)。

---

## 一、备份

脚本:[`scripts/backup.sh`](../scripts/backup.sh)(用 `pg_dump -Fc` 自定义格式)。

```bash
# 直连数据库(宿主已装 postgresql-client)
PG_HOST=localhost PG_USER=navhub PG_PASSWORD=*** PG_DATABASE=navhub \
  BACKUP_DIR=/srv/navhub/backups RETENTION=14 \
  ./scripts/backup.sh

# docker-compose 部署(在 postgres 容器内执行,无需宿主装 pg_dump)
USE_DOCKER_COMPOSE=1 PG_PASSWORD=*** ./scripts/backup.sh

# 同时打包本地上传目录
NAVHUB_UPLOADS_DIR=/srv/navhub/uploads PG_PASSWORD=*** ./scripts/backup.sh
```

脚本会自动读取仓库根目录的 `.env`(若存在),与 compose 共用同一套凭据。
输出形如 `navhub-db-YYYYmmdd-HHMMSS.dump`,并按 `RETENTION` 清理过旧备份。

### 定时备份(cron 示例)

```cron
# 每天 03:30 备份,保留最近 14 份
30 3 * * *  cd /srv/navhub && USE_DOCKER_COMPOSE=1 RETENTION=14 \
  PG_PASSWORD=*** /srv/navhub/scripts/backup.sh >> /var/log/navhub-backup.log 2>&1
```

> 把备份**异地同步**(rsync / 对象存储)才算真正安全——本机磁盘损坏会同时带走备份。

---

## 二、恢复

脚本:[`scripts/restore.sh`](../scripts/restore.sh)(`pg_restore --clean --if-exists -1`,单事务,失败整体回滚)。**破坏性操作**,默认需交互确认。

```bash
USE_DOCKER_COMPOSE=1 PG_PASSWORD=*** \
  ./scripts/restore.sh /srv/navhub/backups/navhub-db-20260529-033000.dump
# 按提示输入数据库名确认;自动化场景可用 FORCE=1 跳过

# 本地上传目录恢复(如有打包)
tar -xzf navhub-uploads-20260529-033000.tar.gz -C /srv/navhub/
```

恢复后:**重启 navhub**,然后验证登录、分组/图标数量、近期数据是否齐全。

---

## 三、恢复演练清单(建议每季度一次)

> 备份从未被恢复过 = 没有备份。在**独立的演练环境**执行,切勿直接恢复到生产。

- [ ] 取一份**最近**的生产备份(顺带验证备份文件未损坏:`pg_restore -l <dump>` 能列出目录)。
- [ ] 在隔离环境(独立 compose / 临时库)执行 `restore.sh`。
- [ ] 启动应用指向恢复后的库,确认能正常启动(迁移完整性校验通过)。
- [ ] 用管理员账号登录,抽查:用户列表、若干分组与图标、系统消息、偏好设置。
- [ ] 若有本地上传:抽查头像/图标资源可正常加载。
- [ ] 记录**实际恢复耗时(RTO)**与**可接受的数据丢失窗口(RPO)**,据此调整备份频率。
- [ ] 演练结束销毁演练环境与其中的数据副本。

---

## 四、多副本与迁移(关联 OPS-12)

应用启动时执行数据库迁移(幂等:已应用版本跳过,并校验重复版本号/checksum)。
- **单实例**:无需特殊处理。
- **多副本**:首次上线**含新迁移**的版本时,先把 navhub 缩到 **1 副本**完成迁移再扩容,
  或采用 `docker-compose.yaml` 注释中描述的"单迁移者"一次性服务模式,避免多副本并发建表竞态。
- 生产环境若迁移文件 checksum 与已应用记录不一致(例如历史迁移被改名),启动会**告警但继续**;
  需强制阻断时设 `NAVHUB_MIGRATION_STRICT=1`(详见 `config.example.toml` / 部署文档)。
