import { useEffect, useRef, useState } from "react";

const IMAGE_RETRY_DELAYS_MS = [1_000, 3_000, 8_000, 15_000];
const IMAGE_LOAD_TIMEOUT_MS = 20_000;
const IMAGE_DECODE_TIMEOUT_MS = 8_000;

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
  const loadedUrlRef = useRef(loadedUrl);
  const [prevUrl, setPrevUrl] = useState<string | undefined>(undefined);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryCountRef = useRef(0);

  useEffect(() => {
    retryCountRef.current = 0;
  }, [wallpaperUrl]);

  useEffect(() => {
    if (!wallpaperUrl) {
      loadedUrlRef.current = undefined;
      setLoadedUrl(undefined);
      setPrevUrl(undefined);
      return;
    }
    if (wallpaperUrl === loadedUrlRef.current) {
      return;
    }

    // PERF-9: 交叉淡入用的 setTimeout 此前从不清理,卸载/壁纸切换后回调仍会
    // 触发 setPrevUrl,造成定时器泄漏与「卸载后 setState」。这里统一持有
    // 定时器 id 并在 effect 清理中清除。
    let fadeTimer: number | undefined;
    let retryTimer: number | undefined;
    let loadTimer: number | undefined;
    let decodeTimer: number | undefined;
    let animationFrame: number | undefined;

    if (wallpaperMediaType === "video") {
      const previous = loadedUrlRef.current;
      if (previous && previous !== wallpaperUrl) {
        setPrevUrl(previous);
        fadeTimer = window.setTimeout(() => {
          setPrevUrl((current) => (current === previous ? undefined : current));
        }, 1000);
      }
      loadedUrlRef.current = wallpaperUrl;
      setLoadedUrl(wallpaperUrl);
      return () => {
        if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
      };
    }

    const previous = loadedUrlRef.current;
    if (previous && previous !== wallpaperUrl) {
      setPrevUrl(previous);
    }

    let cancelled = false;
    const img = new window.Image();
    img.decoding = "async";
    const finish = () => {
      if (cancelled) return;
      if (loadTimer !== undefined) window.clearTimeout(loadTimer);
      retryCountRef.current = 0;
      loadedUrlRef.current = wallpaperUrl;
      setLoadedUrl(wallpaperUrl);
      fadeTimer = window.setTimeout(() => {
        setPrevUrl((current) => (current === previous ? undefined : current));
      }, 1000);
    };
    const retry = () => {
      if (cancelled) return;
      if (loadTimer !== undefined) window.clearTimeout(loadTimer);
      const attempt = retryCountRef.current++;
      const delay = IMAGE_RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) {
        retryTimer = window.setTimeout(
          () => setRetryNonce((value) => value + 1),
          delay,
        );
      } else {
        console.warn("Wallpaper image failed after retries", wallpaperUrl);
      }
    };
    img.onload = () => {
      if (loadTimer !== undefined) window.clearTimeout(loadTimer);
      const decode = img.decode
        ? img.decode().catch(() => undefined)
        : Promise.resolve();
      const timeout = new Promise<void>((resolve) => {
        decodeTimer = window.setTimeout(resolve, IMAGE_DECODE_TIMEOUT_MS);
      });
      Promise.race([decode, timeout]).then(() => {
        if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
        animationFrame = window.requestAnimationFrame(finish);
      });
    };
    img.onerror = retry;
    loadTimer = window.setTimeout(() => {
      // A stalled request may never emit `error`. Abort this attempt so the
      // next stable `/uploads/...` request gets a fresh S3 redirect.
      img.onload = null;
      img.onerror = null;
      img.src = "";
      retry();
    }, IMAGE_LOAD_TIMEOUT_MS);
    img.src = wallpaperUrl;
    return () => {
      cancelled = true;
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (loadTimer !== undefined) window.clearTimeout(loadTimer);
      if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
      if (animationFrame !== undefined)
        window.cancelAnimationFrame(animationFrame);
      img.onload = null;
      img.onerror = null;
    };
  }, [wallpaperUrl, wallpaperMediaType, retryNonce]);

  const fullImageReady =
    wallpaperMediaType === "video" || loadedUrl === wallpaperUrl;
  const showPrevious = !!prevUrl && prevUrl !== wallpaperUrl;
  const isCrossfade = !!prevUrl && fullImageReady && prevUrl !== loadedUrl;

  return (
    <>
      <div className={`bg-layer bg-${theme}`} key={`theme-${theme}`} />

      {/* Previous wallpaper stays underneath during crossfade */}
      {showWallpaper && showPrevious ? (
        <div
          className="bg-wallpaper-frame"
          key={`prev-${prevUrl}`}
          style={{ zIndex: 0 }}
        >
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
          className={
            "bg-wallpaper-frame" +
            (isCrossfade ? " bg-wallpaper-frame-fade" : "")
          }
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
