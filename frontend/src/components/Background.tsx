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
  const [prevUrl, setPrevUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!wallpaperUrl) {
      setLoadedUrl(undefined);
      setPrevUrl(undefined);
      return;
    }
    if (wallpaperMediaType === "video" || wallpaperUrl === loadedUrl) {
      setLoadedUrl(wallpaperUrl);
      return;
    }
    
    // Check if it's already loaded or wait for it
    const img = new window.Image();
    img.onload = () => {
      setPrevUrl(loadedUrl);
      setLoadedUrl(wallpaperUrl);
      
      // Clear prevUrl after animation finishes to free DOM/memory
      setTimeout(() => {
        setPrevUrl((current) => current === loadedUrl ? undefined : current);
      }, 1000);
    };
    img.onerror = () => {
      setPrevUrl(loadedUrl);
      setLoadedUrl(wallpaperUrl);
    };
    img.src = wallpaperUrl;
  }, [wallpaperUrl, wallpaperMediaType, loadedUrl]);

  return (
    <>
      <div className={`bg-layer bg-${theme}`} key={`theme-${theme}`} />
      
      {/* Previous wallpaper stays underneath during crossfade */}
      {showWallpaper && prevUrl && prevUrl !== loadedUrl ? (
        <div className="bg-wallpaper-frame" key={`prev-${prevUrl}`} style={{ zIndex: 0 }}>
          <div
            className="bg-wallpaper"
            style={{ backgroundImage: `url("${prevUrl}")` }}
          />
        </div>
      ) : null}

      {/* New wallpaper fades in on top */}
      {showWallpaper && loadedUrl ? (
        <div className="bg-wallpaper-frame" key={`wallpaper-${loadedUrl}`} style={{ zIndex: 1 }}>
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
