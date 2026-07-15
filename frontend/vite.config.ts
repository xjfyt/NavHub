import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  // UX-9: 构建时注入版本号(只读 package.json),供「关于」页展示,避免硬编码。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8088", changeOrigin: false },
      "/auth": { target: "http://127.0.0.1:8088", changeOrigin: false },
      "/uploads": { target: "http://127.0.0.1:8088", changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // PERF-6: 用函数形式的 manualChunks,把「任意」@milkdown/* 包(含
        // 直接依赖与 ctx/transformer/prose 等传递依赖,以及未来可能新增的
        // 子包)都收进独立的 milkdown chunk。MarkdownWidget 已是 React.lazy
        // 动态导入,故该 ~454KB chunk 不进入入口 / 不在首屏 HTML 中预加载,
        // 仅在笔记编辑器真正挂载时按需拉取。函数式写法比白名单更稳健,杜绝
        // 漏列子包导致重型编辑器代码悄悄回流进入口 bundle。
        manualChunks(id) {
          if (id.includes("node_modules/@milkdown/")) return "milkdown";
          // ProseMirror 是 Milkdown 的底层依赖,同样只在编辑器内用到。
          if (id.includes("node_modules/prosemirror-")) return "milkdown";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/")
          ) {
            return "vendor";
          }
          // sonner 在首屏即需(App.tsx 挂载 <Toaster />),保持独立小 chunk。
          if (id.includes("node_modules/sonner/")) return "ui";
        },
      },
    },
  },
});
