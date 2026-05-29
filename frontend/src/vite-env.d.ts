/// <reference types="vite/client" />

// QUAL-13: 引入 `declare global { interface Window }` 后本文件成为模块,
// 因此 __APP_VERSION__ 这类全局也需移入 declare global 块内才能保持全局可见。
declare global {
  // UX-9: 构建时由 vite.config.ts 的 define 注入的应用版本号(来自 package.json)。
  const __APP_VERSION__: string;

  // QUAL-13: 应用名由 boot 流程从 /auth/status 写入 window.appName(供 document.title 与
  // 管理后台标题等读取)。以正式的全局声明取代散落各处的 `(window as any).appName`。
  interface Window {
    /** 实例名称,boot 成功后由 App 写入;读取方有兜底默认值(如 "NavHub")。 */
    appName?: string;
  }
}

export {};
