import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" assert { type: "json" };

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
        manualChunks: {
          vendor: ["react", "react-dom"],
          // Markdown editor: heavy and only needed when the markdown widget
          // mounts.
          milkdown: [
            "@milkdown/core",
            "@milkdown/ctx",
            "@milkdown/preset-commonmark",
            "@milkdown/preset-gfm",
            "@milkdown/prose",
            "@milkdown/react",
            "@milkdown/transformer",
            "@milkdown/plugin-history",
            "@milkdown/plugin-listener",
          ],
          // sonner is needed at first paint (App.tsx mounts <Toaster />),
          // so it stays in its own small always-loaded chunk.
          ui: ["sonner"],
        },
      },
    },
  },
});
