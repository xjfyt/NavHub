# Cloudflare CDN + MinIO 公开读 接入指南

国外服务器、国内访问的场景下，把静态资源（前端 JS/CSS、壁纸图片、图标）扔到 Cloudflare 边缘节点能直接把延迟从 200-500ms 拉到 30-80ms。本文按"做完每一步线上立竿见影"的顺序写。

> 整套方案影响范围：`navigation.xjfyt.com`（NavHub 主站）、`minio.xjfyt.com`（对象存储）。Casdoor（`auth.xjfyt.com`）按需可选，不建议接 CDN（OIDC 流多次跨站重定向，CDN 会把缓存搞乱）。

---

## 0. 接入前清单

- [ ] 域名 `xjfyt.com` 的 DNS 在 Cloudflare 托管，或可改 NS 切到 Cloudflare
- [ ] 服务器仍在原 IP 跑（CDN 只是在前面套一层）
- [ ] 反代上原本的 TLS 证书可继续用，或换 Cloudflare Origin 证书
- [ ] **国内 ICP 备案**：Cloudflare 在国内的 Anycast 节点对没备案的域名有时返回 522 / 1020。如果 `xjfyt.com` 没备案，国内某些 ISP 会绕路到海外节点 —— 仍有提速，但不如香港/新加坡专线
- [ ] 心里有数：免费版 Cloudflare 国内走的是境外节点，提速主要来自就近 + HTTP/3 + 边缘缓存；想要真·国内边缘节点要么是 Cloudflare 中国（合作伙伴方案，需备案+企业版），要么换腾讯/阿里 EdgeOne

---

## 1. MinIO 把 `assets/*` 改成公开读

目的是让壁纸/图标 URL 不再每次重签名 —— **同一文件 URL 永久稳定** → CDN 才能命中缓存。

### 1.1 安装 mc（MinIO 客户端）

```bash
# Linux/macOS 二选一
curl -O https://dl.min.io/client/mc/release/linux-arm64/mc
chmod +x mc && sudo mv mc /usr/local/bin/
```

### 1.2 配置 alias 并设公开读策略

```bash
# 用 MinIO 控制台的 root 凭证或一个有 admin:* 权限的 key
mc alias set xjfyt https://minio.xjfyt.com <ACCESS_KEY> <SECRET_KEY>

# 验证可达
mc ls xjfyt/navigation

# 给 assets/ 前缀的对象设置公开匿名读（不影响其他前缀）
cat > /tmp/navigation-public-assets.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAssets",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::navigation/assets/*"]
    }
  ]
}
EOF

mc anonymous set-json /tmp/navigation-public-assets.json xjfyt/navigation
# 或更简单（如果整个 bucket 都允许，但更宽）：
# mc anonymous set download xjfyt/navigation
```

### 1.3 验证

```bash
# 找一张已知的壁纸 key，直接 GET，不要带 signature 参数
curl -I "https://minio.xjfyt.com/navigation/assets/wallpapers/remote/<sha256>.jpg"
# 期望：HTTP/2 200，无 X-Amz-* 头
```

### 1.4 NavHub 后端不再签名（可选，立即生效，最干净）

当前 `backend/src/handlers/wallpapers.rs` 和 `backend/src/handlers/upload.rs` 用 `presign_get_url(key)` 给出签名 URL。改成拼直链：

```rust
// 在 storage.rs 增加
pub fn public_url(&self, public_name: &str) -> AppResult<String> {
    let key = self.object_key(public_name)?;
    Ok(format!(
        "{}/{}/{}",
        self.endpoint.trim_end_matches('/'),
        self.bucket,
        key,
    ))
}
```

`endpoint` 需要补存进 `Storage`。然后把所有 `presign_get_url(...).await` 改成 `public_url(...)`。

不改也行——`presign_get_url` 在 24h TTL 下，同一对象的 URL 在 24 小时内字节完全一致，Cloudflare 仍可基于带 query 的 URL 缓存（默认 Cloudflare 会忽略 query 参数缓存，要在 Cache Rule 里勾上"按 query string 区分"）。直接公开读是治本。

---

## 2. Cloudflare 接入主站 `navigation.xjfyt.com`

### 2.1 把 DNS 移到 Cloudflare（如果还没做）

1. Cloudflare 控制台 → Add a Site → 输入 `xjfyt.com`
2. 选 Free Plan（够用）
3. 拷贝 Cloudflare 分配的两个 NS 服务器，去域名注册商面板改 NS
4. 等 NS 生效（通常 5 分钟到 24 小时），Cloudflare 状态变 Active

### 2.2 DNS 记录配置

| Type | Name | Content | Proxy (orange cloud) |
|---|---|---|---|
| A | navigation | `163.192.125.225` | **Proxied** ✓ |
| A | minio | `163.192.125.225`（或 MinIO 实际 IP） | **Proxied** ✓ |
| A | auth | `163.192.125.225` | **DNS only**（OIDC 流不接 CDN） |

橙色云朵 = 流量经 Cloudflare；灰色 = 仅托管 DNS。

### 2.3 SSL/TLS 模式

进入域名 → SSL/TLS → Overview，选 **Full (strict)**。

- 原 openresty 是带证书的（你已经有 HTTPS），所以选 Full strict 而不是 Flexible
- 如果你想换成 Cloudflare 颁发的 origin certificate：SSL/TLS → Origin Server → Create Certificate，把生成的 cert/key 装到 openresty，把 listener 改成监听 443 用这套证书。Cloudflare 之外的请求拿不到这套 origin cert，可以顺便做"只允许 Cloudflare 回源"

### 2.4 缓存规则（Cache Rules）

进入域名 → Rules → Cache Rules → Create rule。

**规则 1：前端静态资源长缓存**

| 字段 | 值 |
|---|---|
| Rule name | navhub-static-assets |
| When incoming requests match | `URI Path starts with /assets/` |
| Cache eligibility | Eligible for cache |
| Edge TTL | Override origin → 1 year (31536000) |
| Browser TTL | Use cache control header from origin（后端已设 immutable） |

**规则 2：壁纸/图标对象 长缓存**

| 字段 | 值 |
|---|---|
| Rule name | navhub-uploads-and-minio |
| When incoming requests match | `Hostname equals minio.xjfyt.com` OR `URI Path starts with /uploads/` |
| Cache eligibility | Eligible for cache |
| Edge TTL | Override origin → 1 month (2592000) |
| Browser TTL | 7 days |
| Cache Key 高级选项 | **如果 MinIO 仍走 presign**（保留 24h TTL），勾上 "Include query string in cache key" 并只选 `X-Amz-Signature, X-Amz-Date, X-Amz-Expires` 之外的 query 项 —— 否则每次签名变化都是新 key 不命中 |

**规则 3：API / 认证不缓存（兜底）**

| 字段 | 值 |
|---|---|
| Rule name | navhub-api-no-cache |
| When incoming requests match | `URI Path starts with /api/` OR `URI Path starts with /auth/` |
| Cache eligibility | Bypass cache |

后端已经在所有 `/api/*` 和 `/auth/*` 响应里设了 `Cache-Control: no-store`，这条是兜底，确保即使后端漏设，CDN 也绝不缓存登录态相关响应。

### 2.5 压缩 & HTTP/3

- Speed → Optimization → Auto Minify：JS/CSS/HTML 全勾
- Network → 启用 HTTP/3 (with QUIC)、0-RTT Connection Resumption
- Speed → Brotli：开（Cloudflare 会替你压缩）

> 注意：后端已有 `tower-http` 的 brotli/gzip/zstd 压缩，但回源时 Cloudflare 自己会重新协商压缩，不冲突。

---

## 3. Cloudflare 接 MinIO 子域

如果 1.2 步已经做了公开读，`minio.xjfyt.com` 的所有 `assets/*` 请求都是 200 + 直接图片字节，可被任意中间缓存。

### 3.1 Cache 规则（已在 2.4 规则 2 覆盖）

确保 `minio.xjfyt.com` 这个 DNS 记录的 Proxy 是 orange-cloud。

### 3.2 验证缓存命中

```bash
# 第一次（MISS）
curl -sk -I "https://minio.xjfyt.com/navigation/assets/wallpapers/remote/<sha>.jpg" | grep -i cf-cache-status
# CF-Cache-Status: MISS

# 几秒后再来（HIT）
curl -sk -I "https://minio.xjfyt.com/navigation/assets/wallpapers/remote/<sha>.jpg" | grep -i cf-cache-status
# CF-Cache-Status: HIT
```

`HIT` 出现就成了。从国内访问 `HIT` 响应的 RTT 应该在 30-80ms。

### 3.3 限制 MinIO 只接受 Cloudflare 回源（可选，更安全）

把直连 `minio.xjfyt.com` 的源 IP 加白名单到 Cloudflare 出口段。Cloudflare 的 IP 段：<https://www.cloudflare.com/ips/>。

在 openresty 加：

```nginx
location / {
    set $allow 0;
    if ($realip_remote_addr ~* "^(173\.245\.|103\.21\.|103\.22\.|103\.31\.|141\.101\.|108\.162\.|190\.93\.|188\.114\.|197\.234\.|198\.41\.|162\.158\.|104\.16\.|104\.24\.|172\.64\.|131\.0\.)") {
        set $allow 1;
    }
    if ($allow = 0) { return 403; }
    proxy_pass http://minio-backend;
}
```

或开 Cloudflare → Origin Rules → "Authenticated Origin Pulls"，自动给所有回源请求带 client cert，配合 nginx 校验，更稳。

---

## 4. 验证整体加速效果

```bash
# 国内 VPS 上跑（北京/上海/深圳任一）

# 主站 HTML
curl -o /dev/null -sw "html: %{time_total}s\n" https://navigation.xjfyt.com/

# 静态 JS（应该命中 CF 缓存）
curl -o /dev/null -sw "js: %{time_total}s\n" https://navigation.xjfyt.com/assets/index-<hash>.js

# 壁纸
curl -o /dev/null -sw "wp: %{time_total}s\n" https://minio.xjfyt.com/navigation/assets/wallpapers/remote/<sha>.jpg

# 第一次 vs 第二次时间，第二次应该 < 100ms
```

接 Cloudflare 后预期：
- 国内首次访问主站 HTML：1.5-3s → 0.3-0.8s
- 静态 JS 二次加载：从浏览器缓存秒开（没变化，原本就有 immutable）
- 第二次进入页面壁纸：从被签名 URL 失效后再下载 → 命中边缘几十毫秒返回

---

## 5. 出问题时排查清单

| 现象 | 检查 |
|---|---|
| Cloudflare 522 error | openresty 没监听 80/443、或防火墙阻断 Cloudflare IP 段 |
| 525 SSL handshake fail | SSL/TLS 模式选了 Full strict，但 origin 证书过期或自签 → 换 Cloudflare Origin Certificate 或降到 Full（非 strict） |
| 1020 Access denied | Cloudflare Bot Fight 或 WAF 误杀，去 Security → WAF 看 events |
| 登录后 logout 不掉 | Cloudflare 把 `/auth/*` 缓存了 → 检查 Cache Rules 是否漏配 |
| 壁纸命中率低（一直 MISS） | Cache Key 没忽略 X-Amz-Signature 等签名参数；或 origin 响应带 `Cache-Control: no-cache` 把 CF 也禁掉了 |
| 国内某些运营商访问慢 | Cloudflare 节点选路问题，免费版无解；考虑接入 EdgeOne 等国内 CDN |

---

## 6. 回滚

1. 域名 → DNS → 把 `navigation` / `minio` 记录的橙色云朵切回灰色（DNS only）
2. 5-15 分钟传播完成，所有流量直回源
3. MinIO 的 public-read 策略可保留（无副作用），也可：`mc anonymous set none xjfyt/navigation`
