/// <reference types="vite/client" />

// UX-9: 构建时由 vite.config.ts 的 define 注入的应用版本号(来自 package.json)。
declare const __APP_VERSION__: string;
