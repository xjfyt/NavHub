import { useEffect } from "react";

export function useColorMode(mode: string | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const actualMode = mode || "auto";
    const mm = window.matchMedia("(prefers-color-scheme: light)");

    const applyMode = () => {
      const actual =
        actualMode === "auto" ? (mm.matches ? "light" : "dark") : actualMode;
      root.dataset.mode = actual;
    };

    applyMode();
    if (actualMode === "auto") {
      mm.addEventListener("change", applyMode);
      return () => mm.removeEventListener("change", applyMode);
    }
  }, [mode]);
}
