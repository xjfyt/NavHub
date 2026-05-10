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

  // Animate the fade only on shuffle transitions (prevUrl present). On first
  // paint we want the wallpaper to appear instantly the moment the image
  // decodes — no 800ms reveal sitting on top of an already-cached image.
  const isCrossfade = !!prevUrl && prevUrl !== loadedUrl;

  return (
    <>
      <div className={`bg-layer bg-${theme}`} key={`theme-${theme}`} />

      {/* Previous wallpaper stays underneath during crossfade */}
      {showWallpaper && isCrossfade ? (
        <div className="bg-wallpaper-frame" key={`prev-${prevUrl}`} style={{ zIndex: 0 }}>
          <div
            className="bg-wallpaper"
            style={{ backgroundImage: `url("${prevUrl}")` }}
          />
        </div>
      ) : null}

      {/* New wallpaper. Thumbnail (poster) renders instantly as a backdrop so
          the user never sees solid theme color while the full-res image is
          still travelling across the Pacific. The full image paints over it
          when the browser finishes decoding. */}
      {showWallpaper && loadedUrl ? (
        <div
          className={"bg-wallpaper-frame" + (isCrossfade ? " bg-wallpaper-frame-fade" : "")}
          key={`wallpaper-${loadedUrl}`}
          style={{ zIndex: 1 }}
        >
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
            <>
              {wallpaperPosterUrl ? (
                <div
                  className="bg-wallpaper bg-wallpaper-thumb"
                  style={{ backgroundImage: `url("${wallpaperPosterUrl}")` }}
                />
              ) : null}
              <div
                className="bg-wallpaper"
                style={{ backgroundImage: `url("${loadedUrl}")` }}
              />
            </>
          )}
        </div>
      ) : null}

      <div className={"bg-scene" + (showWallpaper ? " wallpaper-on" : "")} />
      <div className="bg-noise" />
    </>
  );
}
