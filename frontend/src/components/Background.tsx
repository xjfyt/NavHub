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
  return (
    <>
      <div className={`bg-layer bg-${theme}`} key={`theme-${theme}`} />
      {showWallpaper && wallpaperUrl ? (
        <div className="bg-wallpaper-frame" key={`wallpaper-${wallpaperUrl}`}>
          {wallpaperMediaType === "video" ? (
            <video
              className="bg-wallpaper-video"
              src={wallpaperUrl}
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
                backgroundImage: `url("${wallpaperUrl}")`,
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
