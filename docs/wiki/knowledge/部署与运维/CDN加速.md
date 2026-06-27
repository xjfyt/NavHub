# CDN 加速配置

## 概述
NavHub 使用 Cloudflare CDN 加速静态资源，将延迟从 200-500ms 降到 30-80ms。

## 影响范围
- navigation.xjfyt.com (主站)
- minio.xjfyt.com (对象存储)
- auth.xjfyt.com (不建议接CDN)

## MinIO 公开读

配置 assets/* 前缀公开匿名读，使壁纸/图标 URL 稳定，CDN 才能命中缓存。

## Cloudflare 缓存规则

### 规则1: 前端静态资源
- 匹配: URI Path starts with /assets/
- Edge TTL: 1 年
- Browser TTL: 按 origin 头

### 规则2: 壁纸/图标对象
- 匹配: minio.xjfyt.com 或 /uploads/
- Edge TTL: 1 个月
- Browser TTL: 7 天

### 规则3: API/认证不缓存
- 匹配: /api/ 或 /auth/
- 策略: Bypass cache

## SSL/TLS 配置
- 模式: Full (strict)
- 启用 HTTP/3
- 启用 Brotli 压缩

## DNS 配置
| 记录 | 代理 |
|---|---|
| navigation | Proxied |
| minio | Proxied |
| auth | DNS only |

## 验证方法
`ash
curl -sk -I https://minio.xjfyt.com/navigation/assets/xxx.jpg | grep -i cf-cache-status
# 期望: CF-Cache-Status: HIT
``n
## 排查清单
- 522: openresty 没监听或防火墙阻断
- 525: SSL 证书问题
- 1020: WAF 误杀
- 登录后logout不掉: /auth/* 被缓存