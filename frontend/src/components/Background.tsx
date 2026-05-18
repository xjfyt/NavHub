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
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(() =>
    wallpaperMediaType === "video" ? wallpaperUrl : undefined,
  );
  const [prevUrl, setPrevUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!wallpaperUrl) {
      setLoadedUrl(undefined);
      setPrevUrl(undefined);
      return;
    }
    if (wallpaperUrl === loadedUrl) {
      return;
    }

    if (wallpaperMediaType === "video") {
      const previous = loadedUrl;
      if (previous && previous !== wallpaperUrl) {
        setPrevUrl(previous);
        window.setTimeout(() => {
          setPrevUrl((current) => (current === previous ? undefined : current));
        }, 1000);
      }
      setLoadedUrl(wallpaperUrl);
      return;
    }

    const previous = loadedUrl;
    if (previous && previous !== wallpaperUrl) {
      setPrevUrl(previous);
    }

    let cancelled = false;
    const img = new window.Image();
    img.decoding = "async";
    const finish = () => {
      if (cancelled) return;
      setLoadedUrl(wallpaperUrl);
      window.setTimeout(() => {
        setPrevUrl((current) => (current === previous ? undefined : current));
      }, 1000);
    };
    img.onload = () => {
      const decoded = img.decode ? img.decode().catch(() => undefined) : Promise.resolve();
      decoded.then(() => window.requestAnimationFrame(finish));
    };
    img.onerror = () => {
      finish();
    };
    img.src = wallpaperUrl;
    return () => {
      cancelled = true;
    };
  }, [wallpaperUrl, wallpaperMediaType, loadedUrl]);

  const fullImageReady = wallpaperMediaType === "video" || loadedUrl === wallpaperUrl;
  const showPrevious = !!prevUrl && prevUrl !== wallpaperUrl;
  const isCrossfade = !!prevUrl && fullImageReady && prevUrl !== loadedUrl;

  return (
    <>
      <div className={`bg-layer bg-${theme}`} key={`theme-${theme}`} />

      {/* Previous wallpaper stays underneath during crossfade */}
      {showWallpaper && showPrevious ? (
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
      {showWallpaper && wallpaperUrl ? (
        <div
          className={"bg-wallpaper-frame" + (isCrossfade ? " bg-wallpaper-frame-fade" : "")}
          key={`wallpaper-${wallpaperUrl}`}
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
              {loadedUrl === wallpaperUrl ? (
                <div
                  className="bg-wallpaper"
                  style={{ backgroundImage: `url("${loadedUrl}")` }}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className={"bg-scene" + (showWallpaper ? " wallpaper-on" : "")} />
      <div className="bg-noise" />
    </>
  );
}
