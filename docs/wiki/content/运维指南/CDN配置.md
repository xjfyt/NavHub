---
title: Cloudflare CDN配置
description: NavHub项目Cloudflare CDN接入完整指南，包含MinIO公开读配置和缓存优化
keywords: CDN, Cloudflare, MinIO, 缓存, 加速
author: NavHub Team
last_updated: 2026-06-27
category: 运维指南
nav_order: 2
---

# Cloudflare CDN配置

> **对应代码**：`backend/src/storage.rs`、`backend/src/handlers/wallpapers.rs`
> **维护提示**：CDN或存储配置变更时同步更新本文档。

国外服务器、国内访问的场景下，把静态资源（前端JS/CSS、壁纸图片、图标）放到Cloudflare边缘节点，能把延迟从200-500ms降到30-80ms。

> 影响范围：`navigation.xjfyt.com`（NavHub主站）、`minio.xjfyt.com`（对象存储）。OIDC认证服务不建议接CDN。

---

## 1. 接入前清单

- [ ] 域名DNS在Cloudflare托管，或可改NS切到Cloudflare
- [ ] 服务器仍在原IP运行（CDN只在前面套一层）
- [ ] 反代TLS证书可继续用，或换Cloudflare Origin证书
- [ ] **国内ICP备案**：Cloudflare免费版国内走境外节点，提速主要来自HTTP/3和边缘缓存

## 2. MinIO 公开读配置

目的是让壁纸/图标URL不再每次重签名，同一文件URL永久稳定，CDN才能命中缓存。

### 2.1 安装mc（MinIO客户端）

```bash
curl -O https://dl.min.io/client/mc/release/linux-arm64/mc
chmod +x mc && sudo mv mc /usr/local/bin/
```

### 2.2 配置alias并设公开读策略

```bash
mc alias set myminio https://minio.example.com <ACCESS_KEY> <SECRET_KEY>
mc ls myminio/navigation

# 给 assets/ 前缀设置公开匿名读
mc anonymous set-json policy.json myminio/navigation
```

策略文件示例（policy.json）：

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadAssets",
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject"],
    "Resource": ["arn:aws:s3:::navigation/assets/*"]
  }]
}
```

### 2.3 验证

```bash
curl -I "https://minio.example.com/navigation/assets/wallpapers/remote/test.jpg"
# 期望：HTTP/2 200，无 X-Amz-* 头
```

## 3. Cloudflare接入主站

### 3.1 DNS记录配置

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | navigation | 服务器IP | Proxied |
| A | minio | MinIO服务器IP | Proxied |
| A | auth | 服务器IP | DNS only |

橙色云朵=流量经Cloudflare；灰色=仅托管DNS。OIDC认证服务建议DNS only。

### 3.2 SSL/TLS模式

进入域名 > SSL/TLS > Overview，选 **Full (strict)**。如果原反代已有HTTPS证书，选Full strict而非Flexible。

### 3.3 缓存规则（Cache Rules）

**规则1：前端静态资源长缓存**
- URI Path starts with /assets/
- Edge TTL: Override origin > 1 year (31536000)

**规则2：壁纸/图标对象长缓存**
- Hostname equals minio.example.com 或 URI Path starts with /uploads/
- Edge TTL: Override origin > 1 month (2592000)

**规则3：API/认证不缓存（兜底）**
- URI Path starts with /api/ 或 /auth/
- Cache eligibility: Bypass cache

### 3.4 压缩与HTTP/3

- Auto Minify：JS/CSS/HTML全勾
- 启用HTTP/3 (with QUIC)
- 启用Brotli压缩

## 4. 验证缓存命中

```bash
# 第一次（MISS）
curl -sk -I "https://minio.example.com/navigation/assets/wallpapers/remote/test.jpg" | grep -i cf-cache-status

# 几秒后再来（HIT）
curl -sk -I "https://minio.example.com/navigation/assets/wallpapers/remote/test.jpg" | grep -i cf-cache-status
```

HIT出现即配置成功。从国内访问HIT响应的RTT应在30-80ms。

## 5. 故障排查

| 现象 | 检查 |
|------|------|
| 522 error | 反代未监听80/443，或防火墙阻断Cloudflare IP段 |
| 525 SSL fail | SSL模式选Full strict但origin证书过期 |
| 1020 Access denied | WAF误杀，去Security > WAF查看events |
| 登录后无法登出 | /auth/*被缓存，检查Cache Rules |
| 壁纸命中率低 | Cache Key未忽略签名参数 |

## 6. 回滚

1. 域名 > DNS > 把橙色云朵切回灰色（DNS only）
2. 5-15分钟传播完成，所有流量直回源

---

- 上一篇：[Docker部署](./Docker部署.md)
- 下一篇：[备份恢复](./备份恢复.md)
- 返回目录：[运维指南](./README.md)
