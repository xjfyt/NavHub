import { useState } from "react";
import { Icon } from "../Icon";
import type { RemoteWallpaperItem } from "../../types";
import { wallpaperImagePreviewUrl } from "./wallpaperPreview";

export const WallpaperGridPreview = ({
  wallpaper,
}: {
  wallpaper: RemoteWallpaperItem;
}) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const imageUrl = wallpaperImagePreviewUrl(wallpaper, thumbFailed);

  if (imageUrl) {
    return (
      <div
        className={
          "tw-wallpaper-thumb" +
          (wallpaper.mediaType === "video" ? " tw-wallpaper-thumb-video" : "")
        }
      >
        <img
          src={imageUrl}
          alt={wallpaper.title ?? ""}
          onError={(e) => {
            if (wallpaper.thumbnailUrl && imageUrl === wallpaper.thumbnailUrl) {
              setThumbFailed(true);
            } else {
              (e.target as HTMLImageElement).style.display = "none";
            }
          }}
        />
        {wallpaper.mediaType === "video" && (
          <span className="tw-wallpaper-play">
            <Icon name="play" size={14} />
          </span>
        )}
      </div>
    );
  }

  if (wallpaper.mediaType === "video" && wallpaper.url) {
    return (
      <div className="tw-wallpaper-thumb tw-wallpaper-thumb-video">
        <video
          className="tw-wallpaper-thumb-video-el"
          src={wallpaper.url}
          muted
          playsInline
          preload="metadata"
        />
        <span className="tw-wallpaper-play">
          <Icon name="play" size={14} />
        </span>
      </div>
    );
  }

  return (
    <div className="tw-wallpaper-thumb tw-wallpaper-thumb-empty">
      <Icon
        name={wallpaper.mediaType === "video" ? "play" : "image"}
        size={18}
      />
    </div>
  );
};

export const WallpaperDetailPreview = ({
  wallpaper,
}: {
  wallpaper: RemoteWallpaperItem;
}) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const imageUrl = wallpaperImagePreviewUrl(wallpaper, thumbFailed);

  if (imageUrl) {
    return (
      <img
        className="tw-wallpaper-detail-img"
        src={imageUrl}
        alt={wallpaper.title ?? ""}
        onError={() => setThumbFailed(true)}
      />
    );
  }

  if (wallpaper.mediaType === "video" && wallpaper.url) {
    return (
      <video
        className="tw-wallpaper-detail-img tw-wallpaper-detail-video"
        src={wallpaper.url}
        muted
        controls
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <div className="tw-wallpaper-detail-img tw-wallpaper-thumb-empty">
      <Icon
        name={wallpaper.mediaType === "video" ? "play" : "image"}
        size={24}
      />
    </div>
  );
};
