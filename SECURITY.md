# 安全策略

## 支持范围

安全修复针对最新发布版本与 `main` 分支。建议始终部署最新版本。

## 上报漏洞

**请勿**通过公开 issue / PR 披露安全漏洞。请私下上报:

- 使用 GitHub 的 **Private vulnerability reporting**(仓库 Security 选项卡 → Report a vulnerability),或
- 通过仓库主页公开的维护者邮箱联系。

上报时请尽量包含:

- 漏洞类型与影响(如越权、SSRF、XSS、信息泄露等)
- 复现步骤 / PoC、受影响的端点或组件、相关版本
- 可能的修复建议(若有)

我们会尽快确认并在合理时间内修复;请在修复发布前对漏洞细节保密。

## 部署侧安全须知

NavHub 的安全依赖正确部署,务必注意:

- **修改初始密码**:默认管理员 `superadmin/superadmin`,首次登录请立即修改。
- **轮换示例凭据**:`config.example.toml` 仅为占位符,生产请使用强随机密钥(数据库、Redis、JWT/会话密钥、SSO client secret)。绝不提交真实密钥;用 `.env` / 密钥存储注入。
- **使用 HTTPS**:将 `public_url` 配为 https,会话 Cookie 才会带 `Secure`;公网 http 部署启动会告警。
- **限制 `/metrics`**:该端点未鉴权,应在反向代理/防火墙/内网层面限制访问。
- **受信代理**:仅当置于受信反向代理之后时,才在 `server.trusted_proxies` 配置其地址以启用 `X-Forwarded-For` 限流。
- **SSO 提权**:`superadmin.first_sso_bind` 默认关闭;如启用务必配 `first_sso_bind_allowlist`。
- **私网目标**:favicon/抓取默认拒绝私网/链路本地地址(SSRF 防护),勿随意放开。

更多见 `config.example.toml` 注释与 `docs/` 部署文档。
