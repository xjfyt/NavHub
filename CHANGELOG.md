# 更新日志 / Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 风格。

## [Unreleased]

## [0.2.1] - 2026-07-15

本版本重点修复壁纸偶发长期停留在主题底色的问题，并补齐项目展示与壁纸模块文档。升级不涉及数据库迁移。

### Fixed 修复
- 升级 `crossbeam-epoch` 至 `0.9.20`、`quinn-proto` 至 `0.11.15`，修复 `RUSTSEC-2026-0204` 与高危远程内存耗尽公告 `RUSTSEC-2026-0185`。
- 壁纸列表不再向前端返回会过期的 S3 预签名 URL，改为稳定的同源 `/uploads/...` 地址；后端在每次请求时生成新的短期签名重定向。
- `/uploads/...` 重定向响应增加 `Cache-Control: no-store`，避免浏览器、代理或 CDN 复用已经过期的签名地址。
- 修复图片 `error` 事件被误判为加载成功的问题，失败时继续保留已显示壁纸或主题底色，不再把故障 URL 标记为已加载。
- 图片加载增加 20 秒卡死检测、8 秒解码保护，以及 1/3/8/15 秒退避重试；网络请求无响应时也能主动恢复。
- 修复启动预加载总是优先使用历史随机壁纸缓存的问题；现在会先判断当前是固定壁纸还是随机轮换模式，并避免原图与缩略图争抢高优先级带宽。
- 修复旧版用户偏好和本地缓存中预签名地址过期后无法自行恢复的问题；前端会识别 `X-Amz-*` 临时参数并按壁纸 UUID 重新解析稳定地址。

### Added 新增
- 新增公开接口 `GET /api/wallpapers/:id`，用于按 UUID 恢复固定壁纸的当前稳定地址。
- 新增临时壁纸 URL 检测与缓存校验测试，后端新增稳定对象路径编码测试。
- README 增加脱敏后的产品主图；项目简介与壁纸库文档增加设置界面截图。
- 壁纸文档补充稳定地址、签名刷新、失败恢复和接口行为说明。

### Changed 变更
- 随机壁纸仅使用后端已本地化的资源池；资源池请求失败时按 5/15/30 秒退避重试，避免依赖不可控的外部直链。
- Vite 配置改用标准 Import Attributes `with { type: "json" }`，消除新版 Node.js 构建警告。
- GitHub Actions 官方运行时依赖升级到 `actions/checkout@v6`、`actions/setup-node@v6` 与 `actions/cache@v6`，消除 Node 20 Action 运行时弃用提示。
- 统一后端、前端、锁文件、部署示例和项目文档版本号为 `0.2.1`。

### Validation 验证
- 后端：143 项 Rust 单元测试通过。
- 前端：37 个测试文件、379 项测试通过。
- `cargo fmt --check`、TypeScript 类型检查、Prettier、ESLint 与生产构建通过。

## [0.2.0] - 2026-05-29

对安全、正确性、性能、可用性与工程化做了系统性加固(三轮审计 + 五维度复查共百余项,后端 142 + 前端 376 单测全绿)。

### Security 安全
- 修复推送分组写权限越权(IDOR)与 `merge_into` 跨分组删除;补全管理员接口权限校验。
- favicon 代理与爬虫下载的 SSRF 加固:重定向不再盲从、私网/链路本地地址始终拒绝、按字节流式限额。
- 前端 XSS 加固:URL 协议白名单(`safeHttpUrl`)、iframe 默认拒绝白名单 + 收紧 sandbox、Markdown 链接清洗。
- SSO/OIDC 登录加固:校验 ID Token(JWKS 签名 + iss/aud/exp/nonce)+ PKCE,`state`/`nonce` 绑定浏览器 Cookie,始终用校验 TLS 的客户端;按 email 绑定要求 `email_verified`;`first_sso_bind` 提权增加显式 allowlist 门控。
- 改密需校验当前密码并提高强度下限;登录限流仅信任受信代理的 XFF 并增加按账号限流。
- 关闭 SQLx 语句日志防止 PII/凭据泄露;示例配置去除真实密钥。

### Added 新增
- 可观测性:`/metrics`(Prometheus)、可切换的 JSON 结构化日志、`x-request-id` 透传与回写。
- 数据可携带性:`GET /api/me/export` 导出当前用户全部数据(GDPR)。
- PWA:manifest、应用图标、离线 Service Worker 与社交分享 head 元信息。
- 轻量 i18n 基础设施(`t()` + 字典 + 语言切换)并迁移代表性界面。
- CI 门禁(后端 fmt/clippy/test/audit、前端 eslint/prettier/typecheck/test/build)与 lint/format 工具链。
- 备份/恢复脚本与运行手册、CONTRIBUTING/SECURITY/.env.example 等项目文档。

### Changed / Fixed 变更与修复
- 数据治理:过期 `system_messages` 后台分批清理、删除用户/壁纸/孤儿资源时一并清理 S3 对象、删除分组时清理偏好中的幽灵引用、过期清理走部分索引。
- 健壮性:外发 HTTP 客户端超时、`CatchPanicLayer`、Redis 连接池上限与超时、缓存击穿单飞去重、迁移完整性校验、分页钳制等。
- 一致性/可访问性:统一可访问 `<Modal>`(焦点陷阱/Esc/aria)、导航磁贴改真实 `<a href>`、`:focus-visible`、`prefers-reduced-motion`、语义化菜单与键盘导航、表单 Enter 提交、危险操作确认/撤销。
- 大量前端反馈与正确性修复(toast/撤销、AbortController、不可变更新、stale 闭包、定时器清理等)与 Widget 功能补全。
- 可维护性重构(QUAL-9):拆分超大文件——WallpaperLibrary(1885→574)、TweaksPanel(1705→305)、IconAssetLibrary(1286→443)、AddIconModal(1217→562)、后端 `admin/wallpapers.rs`(780→子模块目录),抽离子组件/纯函数/类型并补充单测,行为保持不变。

### Performance 性能
- 拆分 `useWorkspace` data/actions context 并稳定回调、`React.memo` 磁贴与排序单元格、widgetData 模块级 TTL 缓存 + 在途去重、Milkdown 独立分包、`content-visibility` 跳过离屏单元格、管理端图片懒加载等。
