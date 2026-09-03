import { useEffect, useReducer, useRef } from "react";
import {
  emptyWallpaperDisplay,
  reduceWallpaperDisplay,
  type WallpaperLayer,
} from "../utils/wallpaperDisplay";
import {
  IMAGE_RETRY_DELAYS_MS,
  isAbortError,
  loadWallpaperAsset,
} from "../utils/wallpaperLoad";

const CROSSFADE_MS = 800;

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
  const [display, dispatch] = useReducer(
    reduceWallpaperDisplay,
    undefined,
    emptyWallpaperDisplay,
  );
  const retryCountRef = useRef(0);

  useEffect(() => {
    retryCountRef.current = 0;
    dispatch({
      type: "target",
      show: !!showWallpaper,
      url: wallpaperUrl,
      posterUrl: wallpaperPosterUrl,
      mediaType: wallpaperMediaType,
    });
  }, [showWallpaper, wallpaperUrl, wallpaperPosterUrl, wallpaperMediaType]);

  useEffect(() => {
    if (!showWallpaper || !wallpaperUrl) return;
    if (display.shown?.url === wallpaperUrl) return;

    const ac = new AbortController();
    let retryTimer: number | undefined;
    const mediaType = wallpaperMediaType === "video" ? "video" : "image";

    const attempt = () => {
      loadWallpaperAsset(wallpaperUrl, mediaType, ac.signal)
        .then(() => {
          if (ac.signal.aborted) return;
          retryCountRef.current = 0;
          const layer: WallpaperLayer = {
            url: wallpaperUrl,
            posterUrl: wallpaperPosterUrl,
            mediaType,
          };
          dispatch({ type: "ready", layer });
        })
        .catch((err) => {
          if (ac.signal.aborted || isAbortError(err)) return;
          dispatch({ type: "fail" });
          const delay = IMAGE_RETRY_DELAYS_MS[retryCountRef.current++];
          if (delay !== undefined) {
            retryTimer = window.setTimeout(attempt, delay);
          } else {
            console.warn("Wallpaper image failed after retries", wallpaperUrl);
          }
        });
    };
    attempt();
    return () => {
      ac.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [
    showWallpaper,
    wallpaperUrl,
    wallpaperMediaType,
    wallpaperPosterUrl,
    display.shown?.url,
  ]);

  useEffect(() => {
    if (!display.outgoing) return;
    const t = window.setTimeout(
      () => dispatch({ type: "fadeDone" }),
      CROSSFADE_MS,
    );
    return () => window.clearTimeout(t);
  }, [display.outgoing, display.shown?.url]);

  const fadeIn = !!display.outgoing && !!display.shown;

  return (
    <>
      <div className={`bg-layer bg-${theme}`} key={`theme-${theme}`} />

      {display.outgoing ? (
        <WallpaperFrame
          key={"out-" + display.outgoing.url}
          layer={display.outgoing}
          fade={false}
          zIndex={0}
        />
      ) : null}

      {display.placeholder && !display.shown ? (
        <div
          className="bg-wallpaper-frame"
          key={`ph-${display.placeholder}`}
          style={{ zIndex: 1 }}
        >
          <div
            className="bg-wallpaper bg-wallpaper-thumb"
            style={{ backgroundImage: `url("${display.placeholder}")` }}
          />
        </div>
      ) : null}

      {display.shown ? (
        <WallpaperFrame
          key={display.shown.url}
          layer={display.shown}
          fade={fadeIn}
          zIndex={1}
        />
      ) : null}

      <div
        className={
          "bg-scene" + (showWallpaper && display.shown ? " wallpaper-on" : "")
        }
      />
      <div className="bg-noise" />
    </>
  );
}

function WallpaperFrame({
  layer,
  fade,
  zIndex,
}: {
  layer: WallpaperLayer;
  fade: boolean;
  zIndex: number;
}) {
  return (
    <div
      className={
        "bg-wallpaper-frame" + (fade ? " bg-wallpaper-frame-fade" : "")
      }
      style={{ zIndex }}
    >
      {layer.mediaType === "video" ? (
        <video
          className="bg-wallpaper-video"
          src={layer.url}
          poster={layer.posterUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      ) : (
        <>
          {layer.posterUrl && layer.posterUrl !== layer.url ? (
            <div
              className="bg-wallpaper bg-wallpaper-thumb"
              style={{ backgroundImage: `url("${layer.posterUrl}")` }}
            />
          ) : null}
          <div
            className="bg-wallpaper"
            style={{ backgroundImage: `url("${layer.url}")` }}
          />
        </>
      )}
    </div>
  );
}
