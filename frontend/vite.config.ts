import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
          ui: ["sonner", "dompurify"],
        },
      },
    },
  },
});
