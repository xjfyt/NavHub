import { useState, useEffect } from "react";

export function Background({
  theme,
  wallpaperUrl,
  wallpaperMediaType,
  wallpaperPosterUrl,
  showWallpaper,
}: {
  theme: string;
  wallpaperUrl?: string;
  wallpaperMediaType?: "image" | "video";
  wallpaperPosterUrl?: string;
  showWallpaper?: boolean;
}) {
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(wallpaperUrl);

  useEffect(() => {
    if (!wallpaperUrl) {
      setLoadedUrl(undefined);
      return;
    }
    if (wallpaperMediaType === "video") {
      setLoadedUrl(wallpaperUrl);
      return;
    }
    
    // Check if it's already loaded or wait for it
    const img = new window.Image();
    img.onload = () => setLoadedUrl(wallpaperUrl);
    img.onerror = () => setLoadedUrl(wallpaperUrl); // fallback
    img.src = wallpaperUrl;
  }, [wallpaperUrl, wallpaperMediaType]);

  return (
    <>
      <div className={`bg-layer bg-${theme}`} key={`theme-${theme}`} />
      {showWallpaper && loadedUrl ? (
        <div className="bg-wallpaper-frame" key={`wallpaper-${loadedUrl}`}>
          {wallpaperMediaType === "video" && loadedUrl === wallpaperUrl ? (
            <video
              className="bg-wallpaper-video"
              src={loadedUrl}
              poster={wallpaperPosterUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            />
          ) : (
            <div
              className="bg-wallpaper"
              style={{
                backgroundImage: `url("${loadedUrl}")`,
              }}
            />
          )}
        </div>
      ) : null}
      <div className={"bg-scene" + (showWallpaper ? " wallpaper-on" : "")} />
      <div className="bg-noise" />
    </>
  );
}
