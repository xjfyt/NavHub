import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./shell.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: register the offline service worker. Guarded so dev (Vite at :5173) and
// insecure contexts are never affected — only in production builds over a
// secure origin (https or localhost). Registration is best-effort: if it
// throws, the app keeps working exactly as before.
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  (window.isSecureContext || window.location.hostname === "localhost")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW registration failed — app still works without offline support. */
    });
  });
}
