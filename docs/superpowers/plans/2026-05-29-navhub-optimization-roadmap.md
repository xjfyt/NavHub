# NavHub 优化路线图（总计划）

> **执行方式：** 这是**总路线图（spec）**，不是逐步实现计划。执行某个里程碑(M0…M5)时，再用 `superpowers:writing-plans` 把该里程碑展开成逐任务 TDD 计划，并用 `superpowers:subagent-driven-development` 执行。
> 复选框 `- [ ]` 用于跟踪里程碑级进度。

**目标：** 在不改动版本号的前提下，分阶段修复 NavHub 三轮审计发现的安全/正确性/性能/UX/工程化问题，使其达到可对外发布(v1.0)的质量。

**架构：** Rust+Axum+SQLx+PostgreSQL+Redis+S3 后端；React18+TS+Vite 前端；一体化 Docker 镜像。

**来源：** R1=安全/正确性/性能审计；R2=功能/界面/交互审计；R3=测试/运维/数据/a11y/i18n/PWA/文档排查。`✓`=已直读源码核实。

---

## 工作约定（执行期遵守）

- **分支**：在 `main` 之外建工作分支（建议 `opt/v0.2.0`），每个修复/优化**独立提交**。
- **版本**：**不改版本号**（保持 `0.1.11`），不动 `package.json`/`Cargo.toml` 版本字段、不建 tag、不写 CHANGELOG 版本号——发布到 v0.2.0 由用户后续自行操作。
- **流程**：每项遵循 **先写失败测试 / 可复现验证 → 实现 → 测试通过 → 提交**（TDD）。安全项必须带回归测试。
- **提交信息**结尾：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **横向轨道(T1–T5)** 在 M0 即启动并贯穿全程。

---

## 横向工程轨道（贯穿，越早越好）

- [ ] **T1 测试骨架**（TEST-1）：后端 `[dev-dependencies]` + `cargo test`；前端 `vitest + @testing-library/react + jsdom`，`package.json` 加 `"test"`。
- [ ] **T2 CI 门禁**（OPS-4/QUAL-6）：新增 `ci.yml`（push/PR）跑 后端 `fmt --check`+`clippy -D warnings`+`test`+`cargo audit`、前端 `eslint`+`typecheck`+`vitest`+`build`；`docker.yml` 加 Trivy 扫描 + SBOM/provenance。
- [ ] **T3 Lint/Format**（QUAL-1..5）：前端 ESLint(flat)+`eslint-plugin-react-hooks`+`jsx-a11y`+Prettier；后端 `rustfmt.toml` + `Cargo.toml [lints]` clippy。
- [ ] **T4 可观测性**（OPS-3/5/8，M2 起）：`/metrics`(axum-prometheus)、JSON 日志可切换、request-id 透传+回写。
- [ ] **T5 文档/基建**（DOC-*，全程随手）：补 LICENSE、修过时文档、补 CONTRIBUTING/SECURITY/CHANGELOG/.env.example。

---

## 🔴 M0 — 安全与部署紧急修复（patch 级，最高优先）

> 全部可被当前用户/访客利用或当前就影响部署。每项带回归测试（顺带把 T1 跑起来）。

- [x] M0 完成(2026-05-29,分支 opt/v0.2.0,7 个提交;后端 14 + 前端 5 单测全绿)

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| SEC-1 ✓ | Crit | M | `backend/src/handlers/util.rs:39` | `group_writable_by` 推送分组对任意登录用户放行 → 传入推送目标列并校验 all/role/user，读写路径统一 |
| SEC-2 ✓ | Crit | S | `backend/src/handlers/icons.rs:261` | `merge_into` 不校验源分组可写 → 跨租户删图标，补源分组校验 |
| SEC-3 ✓ | High | S | `backend/src/handlers/admin/icon_libraries.rs:305` | `update_icon` 丢弃用户、无 admin 校验，补 `at_least_admin` |
| SEC-4 | Crit | M | `backend/src/handlers/favicon.rs`,`state.rs:34` | favicon 跟随重定向不重校验 → `Policy::none()` 或逐跳校验 |
| SEC-5 | Crit | S | `backend/src/handlers/favicon.rs:101` | 私有 IP 开关绑定 `tls_accept_invalid_certs` → 独立配置项解耦 |
| SEC-6 | Crit | M | `wallpapers.rs`,`icon_asset_sources.rs`,`favicon.rs` | 下载体积只看 Content-Length → 改 `bytes_stream()` 流式限额；favicon 加硬上限 |
| SEC-7 ✓ | Crit | S | `frontend/src/widgets/IframeWidget.tsx:18` | 空白名单恒放行 + `endsWith` 绕过 + 沙箱逃逸 → 默认拒绝+精确匹配+去 `allow-same-origin` |
| SEC-8 ✓ | Crit | S | `frontend/src/components/IframePreviewModal.tsx:24` | 原始 url 直入 iframe 无白名单 → 套同一白名单+收紧 sandbox |
| SEC-9 | High | S | `frontend/src/components/Shell.menus.tsx:141`,`Shell.tsx` | `javascript:` URL 被执行 → 新增 `safeHttpUrl()` 统一拦截 |
| SEC-10 | High | M | `wallpapers.rs`,各 scraper | 爬虫下载攻击者可控 URL 无 IP 校验 → 复用 favicon 校验+禁/校验重定向 |
| SEC-11/OPS-2 ✓ | High | S | `config.example.toml`,`Dockerfile:49` | 示例含真实密钥且被 `COPY` 成镜像默认配置 → 占位符化+轮换密钥+镜像不烘焙配置(恢复 fail-fast) |
| OPS-1/DOC-2 ✓ | High | S | `docker-compose.yaml:8`,`README.md:41` | 端口 8080↔8088 错配致 compose 部署连不上 → 统一端口+更新镜像 tag |
| DATA-1 ✓ | High | S | `backend/src/db.rs:15` | SQLx DEBUG 语句日志会打印密码 hash/邮箱 → `log_statements(Off/Trace)` |

---

## 🟠 M1 — 认证加固 + 首次运行可用性

> M0 堵漏后，让"装上就既安全又能用"。

- [x] M1 完成(2026-05-29,分支 opt/v0.2.0;后端 AUTH-1..7 共 47 单测全绿,前端 UX-1/2/31/32 build 通过)

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| AUTH-1 | High | L | `handlers/auth.rs:76`,`auth/casdoor.rs` | 校验 ID Token(JWKS/iss/aud/exp/nonce)+PKCE，始终用校验 TLS 的 client |
| AUTH-2 | High | M | `handlers/auth.rs:280` | 要求 `email_verified`，禁止按邮箱自动绑定到特权账号 |
| AUTH-3 | High | S | `handlers/auth.rs:301` | `first_sso_bind` 加 allowlist/确认，文档化风险 |
| AUTH-4 | High | M | `auth/rate_limit.rs:24` | XFF 仅受信代理可信 + 按账号限流 + SSO 限流 |
| AUTH-5 | Med | S | `handlers/auth.rs:364` | 改密验旧密码/再认证 + 提高强度 |
| AUTH-6 | Med | S | `auth/session.rs:70` | 生产默认 `Secure`，启动校验 `public_url` 为 https |
| AUTH-7 | Med | S | `handlers/auth.rs:34` | OAuth `state`+`nonce` 绑定到浏览器 cookie |
| UX-1 | High | S | `LoginScreen.tsx` | 初始未改密状态在登录页/首启提示默认 `superadmin/superadmin` |
| UX-2 | High | M | `NavView.tsx:651`,`App.tsx:73` | 空 workspace/空分类的引导空态卡片(添加第一个网站/导入) |
| UX-31 | High | L | `styles.css`,`.app` 布局 | 核心布局加断点，侧栏折叠为抽屉/底部 tab |
| UX-32 | High | M | `NavView.tsx:276` | dnd-kit TouchSensor+长按延迟；`touch-action` 仅拖拽时加；触屏滚动翻页 |

---

## 🟡 M2 — 正确性/健壮性 + 数据治理 + 反馈与安全感

- [x] M2 完成(2026-05-29,分支 opt/v0.2.0;后端 107 单测全绿,前端 build 通过 + 62 单测全绿)

**2A 后端正确性/健壮性（R1 P1 + INFRA）**

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| INFRA-1 | High | M | 各 scraper,`iconify.rs:27` | 全加 `connect_timeout`+整体预算；iconify 用带超时的真 client |
| INFRA-2 | High | S | `wallpapers.rs:476`,`icon_asset_sources.rs:333` | 大文件 SHA-256/测量移入 `spawn_blocking` |
| INFRA-3 | High | S | `main.rs:126`,`favicon.rs:343` | 加 `CatchPanicLayer`；避免 `Response::builder().unwrap()` |
| INFRA-4 | Med | M | `wallpapers.rs:173`,`icon_asset_sources.rs:143` | 手动 fetch 纳入 TaskTracker+信号量，受优雅关闭管理 |
| INFRA-5 | Med | S | `favicon.rs:20` | `sz` 限制到白名单尺寸 |
| INFRA-6 | Med | M | `favicon.rs:223` | 缓存击穿 single-flight(Redis 锁/在途去重) |
| INFRA-7 | Med | M | `scraper/desktophut.rs` | "非空页 0 链接"作为告警；选择器可配置 |
| INFRA-8 | Med | S | 各 scraper | `build().unwrap_or_default()` 改 `?`/共享单例 |
| INFRA-9 | Low | S | `favicon.rs:316` | `is_valid_icon` 按图片 magic byte 校验 |
| INFRA-10 | Low | S | `storage.rs:57` | presign TTL `.clamp(60, 86400)` |
| INFRA-11/DATA-10 | Med | S | `cache.rs:4` | Redis 池显式 `max_size`+`wait` 超时 |
| INFRA-12 | Low | S | `main.rs:130` | localhost CORS 源仅 dev 开放 |
| API-1 | Med | S | `admin/push.rs:32` | 校验 `target_type`/role/user 一致性(复用 messages 校验) |
| API-2 | Med | S | `icon_asset_sources.rs:356` | `add_manual_icons` 用 `DO NOTHING` 只计真正新增 |
| API-3 | Low | S | `wallpapers.rs`,`icon_asset_sources.rs` | 删除时递减/重算 `total_fetched`（或弃用该列） |
| API-4 | Med | S | `prefs.rs:58` | 自定义引擎改 jsonb 原子操作或事务+行锁 |
| API-5 | Low | S | `admin/wallpapers.rs:195` 等 | 分页 `limit.clamp(1,MAX)`+`offset.max(0)` |
| API-6 | Med | S | `icon_asset_sources.rs:309` | 爬取的 SVG 走 `scan_svg_for_active_content` |
| API-7 | Low | M | `db.rs:41` | 迁移启动加 checksum/重复 version 完整性校验(非 dev 报错) |

**2B 数据治理（R3 DATA）**

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| DATA-2 | High | M | `tasks.rs`,`messages.rs:37` | 后台清理过期 `system_messages`(级联 message_reads)，5k 分批 |
| DATA-3 | High | M | `admin/users.rs:143`,`storage.rs` | 加 `Storage::delete_object`，删用户清头像等 S3 对象(合规) |
| DATA-7 | Med | S | `admin/wallpapers.rs:258` | 删壁纸/壁纸源(含后台过期清理)一并删 S3 对象 |
| DATA-4 | Med | M | `upload.rs`,`library_icons` | 引用计数/定期 GC 无引用的 library_icons + S3 |
| DATA-5 | Med | S | 迁移 016/024 | 加 `expires_at` 部分索引，清理查询走索引 |
| DATA-6 | Med | S | `001_init`,group 删除路径 | 删 group 时同步剔除 `user_preferences` 数组/JSONB 里的幽灵 UUID |

**2C 反馈与安全感（R2 Phase2）**

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| UX-11 | High | M | `hooks/useWorkspace.tsx:302` | 删除/合并/移动加成功 toast + **危险删除带撤销(undo)** |
| UX-14 | High | M | `WallpaperLibrary.tsx:240`,`IconAssetLibrary.tsx:133` | 抓取接真实任务状态轮询，给"新增 N 张/失败原因" |
| UX-12 | High | S | `admin/tabs/Users.tsx:16` | 改角色加确认 + 成功反馈 + 改自己角色警告 |
| UX-13 | Med | S | `admin/tabs/Settings.tsx:54` | 危险开关(开发者模式/公开访问)二次确认+视觉分区 |
| UX-15 | Med | S | `admin/tabs/SSO.tsx:40` | 保存成功 toast；secret 用 password 输入+占位 |
| UX-16 | Med | S | `hooks/useWidgetConfig.ts:63` | 自动保存失败给 UI 反馈 |
| UX-17 | Med | M | `App.tsx:178` | 冷启动后端不可用显式提示 + 全局 online/offline 横幅 |
| UX-18 | Med | S | `HitokotoWidget.tsx:36`,`IconAssetLibrary.tsx:189` | 错误不再静默/伪装；批量上传给 ok/fail 计数 |
| FE-1 | Med | S | `api.ts:70` | `request` 加 AbortController+超时 |
| FE-2 | Med | S | `widgets/MarkdownWidget.tsx:313` | 移除错位的 DOMPurify；改为禁用/清洗 Milkdown 渲染输出与链接 |
| FE-3 | Med | S | `hooks/useWidgetData.ts:26` | fetcher 接 AbortController，cleanup abort |
| FE-4 | High | S | `App.tsx:153` | guest tweaks 改不可变合并，勿原地 mutate |
| FE-5 | Med | S | `hooks/useWorkspace.tsx:148` | reorder 的 API 调用移出 `setWorkspace` updater |
| FE-6 | Med | S | `widgets/MusicWidget.tsx:40` | 修 `playing` stale 闭包 |
| FE-7 | Med | S | `hooks/useWorkspace.tsx:432` | `addCustomEngine`/`deleteCustomEngine` 加 try/catch+toast |
| FE-8 | Med | S | `widgets/PomodoroWidget.tsx` | 卸载时停 tick + 回收 store |
| FE-9 | Med | S | `components/IconTile.tsx` | 去非空断言/校验 color 索引 |

---

## 🟢 M3 — 功能补全（"做了一半"）+ 一致性/可访问性

- [ ] M3 完成

**3A 功能补全（R2 Phase1 + Widget）**

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| UX-4 ✓ | High | S | `TweaksPanel.tsx` | 背景场景选择器(dawn/ocean/mist/night)，接上 `tweaks.theme` |
| UX-5 ✓ | High | M | `admin/tabs/Users.tsx` | 用户管理补删除/重置密码/最近活跃列 |
| UX-6 | Med | S | `admin/tabs/Audit.tsx:7` | 审计日志接 `q/kind/分页` |
| UX-7 | Med | S | `TweaksPanel.tsx`,`SearchBar.tsx` | 自定义引擎可编辑；落实或移除"Tab 切换引擎" |
| UX-8 ✓ | Low | S | `Shell.tsx:260` | 定义 `--font-main` 或改引用 `--font-sans` |
| UX-9 | Low | S | `TweaksPanel.tsx` | 实现"关于"页；版本号构建期注入 |
| UX-10 | Med | S | `admin/WallpaperLibrary.tsx` | 来源行可点筛选 或 去掉误导高亮 |
| WIDGET-1 | High | S | `widgets/CountdownWidget.tsx:23` | 日期按本地时区解析(off-by-one)；detail 加定时器 |
| WIDGET-2 ✓ | Med | S | `widgets/CalculatorWidget.tsx:34` | 修 className 优先级 bug；明确 `%`；加键盘 |
| WIDGET-3 | Med | M | `widgets/PomodoroWidget.tsx` | 真实提示音；时间戳驱动防漂移；store 回收(并 FE-8) |
| WIDGET-4 | Med | M | `widgets/MusicWidget.tsx` | 切歌自动播；进度可拖动；音量；循环模式 |
| WIDGET-5 | Med | S | `widgets/ClockWidget.tsx` | 世界时区可配置；12/24h;问候语中文化 |
| WIDGET-6 | Med | S | `widgets/WeatherWidget.tsx` | 单位切换(需后端配合)；未配置城市明确引导 |
| WIDGET-9 | Med | L | `widgets/CalendarWidget.tsx` | 实现节假日/纪念日标记 或 修正描述；tile↔detail 月份联动 |
| WIDGET-10 | Med | S | `widgets/IframeWidget.tsx:12` | 统一走 `useWidgetConfig`；加载失败兜底 |
| WIDGET-7 | Med | M | `widgets/*` | 按 `wSpan/wRow` 分档渲染信息量，防 small 档溢出 |

**3B 一致性与可访问性（R2 Phase3 + R3 A11Y）**

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| A11Y-4/UX-24 | High | M | `Dialogs.tsx`,各 *Modal | 统一 `<Modal>`：`role=dialog`+`aria-modal`+焦点陷阱+归还+Esc+回车提交 |
| A11Y-1 | High | L | `components/IconTile.tsx` | 导航磁贴改真实 `<a href>`(键盘/语义/SEO/中键) |
| A11Y-2 | High | S | `styles.css` | 全局 `:focus-visible` 焦点环，去掉裸 `outline:none` |
| A11Y-3 | High | M | `styles.css` | 加 `prefers-reduced-motion` 媒体查询，关无限循环动画 |
| A11Y-5/UX-25 | Med | M | `ContextMenu.tsx`,`UserMenu.tsx`,`SearchBar.tsx` | 菜单/引擎选择改语义按钮+role+方向键/回车 |
| A11Y-6 | Med | S | 各表单 | label 关联 `htmlFor`/包裹 input |
| A11Y-7 | Med | S | 信息性 `<img>` | 补 `alt`(图标名/壁纸标题) |
| A11Y-8 | Med | M | `styles.css` | `--text-mute` 等对比度对照 AA 校准 |
| UX-27 | Med | M | `NavView.tsx`,`Sidebar.tsx` | 跨分类拖拽统一为单一 dnd-kit 实现+进度提示+成功 toast |
| UX-20 | Med | M | `NavView.tsx:369` | 合并文件夹加确认/undo 或悬停确认，提高阈值 |
| UX-21 | Med | S | `widgets/TodoWidget.tsx:45` | tile 显式删除按钮+真实 checkbox+键盘 |
| UX-22 | Med | S | `Shell.menus.tsx:96`,`WidgetDetailModal.tsx` | 详情弹窗加齿轮直达编辑 |
| UX-23 | Low | S | `FolderOverlay.tsx:144` | 显式重命名入口+Esc 取消 |
| UX-28 | Low | S | `Dialogs.tsx` | 危险确认 danger 样式 + confirm 回车提交 |
| UX-29 | Med | S | `AddCategoryModal.tsx`,`AddIconModal.tsx` | `<form onSubmit>` 回车提交 |
| UX-19 | High | M | `NavView.tsx` | 隐藏手势的首次引导/hover 暗示/提示项 |
| UX-3 | Med | S | `Shell.tsx:178` | 访客态登录引导文案 |
| UX-30 | Low | S | 多处 | 错误/微文案统一中文 |

---

## 🔵 M4 — 性能（R1 P2）

- [ ] M4 完成

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| PERF-1 | Crit | M | `hooks/useWorkspace.tsx:340` | 拆分 context(数据/稳定回调)或 ref 暴露 actions，止住全局重渲 |
| PERF-2 | Crit | M | `IconTile.tsx`,`NavView.tsx` | `React.memo` 包裹 `IconTile`/`SortableCell`+稳定 handler |
| PERF-3 | High | M | `hooks/useWidgetData.ts` | module 级 TTL 缓存 + 在途去重；tile/detail 共享数据 |
| PERF-4 | High | S | `WallpaperLibrary.tsx`,`IconAssetLibrary.tsx` | admin 图片 `loading=lazy`+`decoding=async` |
| PERF-5 | High | M | `widgets/MarkdownWidget.tsx` | 侧栏列表与编辑器拆分渲染；`plainPreview` memo |
| PERF-6 | High | S | `vite.config.ts` | `vite build` 确认 Milkdown 独立分包不进入口 |
| PERF-7 | Med | L | `NavView.tsx` | 大分类(>150)虚拟化，仅可见项注册 sortable |
| PERF-8 | Med | S | `widgets/CountdownWidget.tsx` | 低频定时器(已并入 WIDGET-1) |
| PERF-9 | Med | S | `Background.tsx` | 交叉淡入 timer 在 cleanup 清理 |
| PERF-10 | Low | S | `ClockWidget.tsx`,`CalendarWidget.tsx` | 常量数组提到模块作用域 |

---

## ⚪ M5 — 打磨 + 完整性 + 技术债

- [ ] M5 完成

| ID | 严重 | 工作量 | 位置 | 说明 |
|---|---|---|---|---|
| FE-10/QUAL-11 ✓ | High | S | `types.ts:84` | 移除 `Tweaks` 开放索引签名，显式声明字段 |
| QUAL-7 | Med | S | 各 scraper | 抽 `default_client()`/共享单例 |
| QUAL-8 | High | M | `admin/wallpapers.rs`↔`icon_asset_sources.rs` | source CRUD/`download_to_storage` 去重 |
| QUAL-10 | Med | M | `hooks/useWorkspace.tsx` | reorder 纯函数抽离(并启用 TEST-2) |
| QUAL-9 | Med | L | 超大文件 | `WallpaperLibrary/TweaksPanel/IconAssetLibrary/NavView/admin/wallpapers.rs` 拆分 |
| QUAL-12 | Med | S | scraper | 避免 `unwrap_or(false)` 把 DB 错误当"不存在" |
| QUAL-13 | Med | S | 多处 `as any`/断言 | 逐个收敛；`window` 全局用 `declare global` |
| QUAL-14 | Low | S | 多处 | 魔法数收进常量/config |
| I18N-1 | Med | L | 全前端 | 轻量 i18n 字典+`t()`+`lang` 跟随，渐进迁移 |
| PWA-1 | High | M | `frontend/public`,`index.html` | manifest+图标集(192/512/maskable)+最小 SW 离线壳 |
| PWA-2 | Med | S | `index.html` | `theme-color`/`description`/OG/Twitter/apple-touch-icon |
| OPS-3/5/8 | High/Med | M | 见 T4 | 落地 `/metrics`+JSON 日志+request-id 透传 |
| OPS-6 | Med | S | `Dockerfile` | 基础镜像 `@sha256` 锁定 |
| OPS-7 | Med | S | `docker.yml` | GH Actions 锁 SHA |
| OPS-9 | Med | S | `docker-compose.yaml` | 资源限制 + 密钥改 `*_FILE`/secrets |
| OPS-10 | Low | S | `main.rs:171` | readyz 可选浅探 S3 |
| OPS-11 | Low | M | `state.rs:8` | SSO 缓存多副本一致性(pub/sub 或短 TTL) |
| OPS-12 | Low | M | `db.rs:78` | 迁移/建库作为独立 init job 避免多副本竞态 |
| OPS-13 | Med | S | `docs/08`,`scripts/` | 备份脚本固化进仓库 + 恢复演练文档 |
| DATA-8 | Med | L | `push.rs`,`export.rs` | 按 user 全量导出(GDPR 可携带性) |
| DATA-9 | Low | S | `push.rs` | 导入校验 `sha256` |
| DOC-1 ✓ | High | S | 仓库根 | 补 `LICENSE`(MIT 全文) |
| DOC-3 ✓ | Med | S | `docs/04-db-schema.md:88` | 删除/标注已废弃的 `group_visibility` |
| DOC-4 ✓ | Low | S | `docs/04-db-schema.md:3,43` | 统一 PG 版本表述；size CHECK 补 `lg-4,lg-9` |
| DOC-5 | Low | S | 仓库根 | 补 CONTRIBUTING/SECURITY/CHANGELOG/.env.example |
| QUAL-1..5 | High/Med | S | 见 T3 | ESLint+jsx-a11y+react-hooks/Prettier/rustfmt/clippy 落地 |
| TEST-2/3/4 | High | M/L | 见 T1 | 纯函数单测→集成/迁移测试→前端组件测试逐步加厚 |

---

## 排序逻辑与发布节奏

1. **安全不能等**(M0)，**测试/CI/lint 同步起步**(T1–T3)——后续每项都有护栏。
2. M1 让"装上就安全可用"；M2 补正确性/数据治理/信任感；再到 M4 优化稳定目标。
3. M3 把"做了一半"的功能补完入口(ROI 最高)，并一轮重构还清交互/a11y 债。
4. M5 收尾质量/完整性(类型/i18n/PWA/合规/文档)。

| 里程碑 | 对应版本(用户自行 bump) |
|---|---|
| M0 | v0.1.x patch |
| M1 | v0.2.0 |
| M2(+可观测) | v0.3.0 |
| M3 | v0.4.0 |
| M4 | v0.5.0 |
| M5(+文档/i18n 完整) | v1.0.0 |

## 统计
约 110 项（去重后）：Critical 8 · High 约 34 · Med 约 50 · Low 约 18。新增维度集中在 测试(0→建体系)、CI/质量门禁、可观测性、数据治理(S3 孤儿/无界增长)、a11y、PWA、文档基建。
