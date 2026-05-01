import { useState, useEffect } from "react";
import {
  normalizeShuffleInterval,
  randomWallpaperPreset,
  type WallpaperPreset,
} from "../constants/wallpapers";
import { Tweaks } from "../types";

export function useWallpaperShuffle(tweaks: Tweaks) {
  const [shufflePreset, setShufflePreset] = useState<WallpaperPreset | null>(null);

  const shuffleEnabled =
    tweaks.wallpaperShuffle !== false && tweaks.backgroundMode !== "theme";
  const shuffleIntervalSec = normalizeShuffleInterval(tweaks.wallpaperShuffleInterval);

  useEffect(() => {
    if (!shuffleEnabled) {
      setShufflePreset(null);
      return;
    }
    setShufflePreset((prev) => prev || randomWallpaperPreset(null));
    const timer = window.setInterval(() => {
      setShufflePreset((prev) => randomWallpaperPreset(prev?.id || null));
    }, shuffleIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [shuffleEnabled, shuffleIntervalSec]);

  const shuffleActive = shuffleEnabled && !!shufflePreset;

  const nextPreset = () =>
    setShufflePreset((prev) => randomWallpaperPreset(prev?.id || null));

  return { shufflePreset, shuffleEnabled, shuffleActive, nextPreset };
}
