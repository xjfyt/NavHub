import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Reusable building blocks for TweaksPanel. Pulled into a sibling file purely
 * to keep TweaksPanel.tsx focused on the per-section rendering logic — these
 * components have no internal product state of their own.
 */

export const Row = ({
  label,
  children,
  onClick,
}: {
  label: string;
  children?: ReactNode;
  onClick?: () => void;
}) => (
  <div
    className={"tw-row" + (onClick ? " tw-row-click" : "")}
    onClick={onClick}
  >
    <div className="tw-row-label">{label}</div>
    <div className="tw-row-ctrl">{children}</div>
  </div>
);

export const Toggle = ({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    className={"tw-toggle" + (on ? " on" : "")}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!on);
    }}
  >
    <span className="tw-toggle-knob" />
  </button>
);

export const Dropdown = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = options.find((o) => o.id === value) || options[0];
  return (
    <div className="tw-dd" ref={ref}>
      <button
        className="tw-dd-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span>{cur?.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="tw-dd-menu">
          {options.map((o) => (
            <div
              key={o.id}
              className={"tw-dd-item" + (o.id === value ? " active" : "")}
              onClick={(e) => {
                e.stopPropagation();
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Chevron = ({ value }: { value?: ReactNode }) => (
  <span className="tw-chev">
    {value != null && <span className="tw-chev-val">{value}</span>}
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

export const SliderPopover = ({
  title,
  items,
  onClose,
}: {
  title: string;
  items: any[];
  onClose: () => void;
}) => (
  <div className="tw-sub">
    <div className="tw-sub-head">
      <button className="tw-sub-back" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path
            d="M9 3L5 7L9 11"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <h3>{title}</h3>
      <div style={{ width: 24 }} />
    </div>
    <div className="tw-sub-body">
      {items.map((it, i) => (
        <div key={i} className="tw-slider-row">
          <div className="tw-slider-top">
            <span>{it.label}</span>
            <span className="tw-slider-val">
              {it.format ? it.format(it.value) : it.value}
            </span>
          </div>
          <input
            type="range"
            min={it.min}
            max={it.max}
            step={it.step || 1}
            value={String(it.value)}
            onChange={(e) => it.onChange(+e.target.value)}
          />
        </div>
      ))}
    </div>
  </div>
);

export const WallpaperPreview = ({
  mediaType,
  url,
  posterUrl,
  className,
  emptyText,
}: {
  mediaType: "image" | "video";
  url?: string;
  posterUrl?: string;
  className: string;
  emptyText?: string;
}) => {
  if (!url) {
    return (
      <div className={className}>
        <span>{emptyText}</span>
      </div>
    );
  }
  if (mediaType === "video") {
    return (
      <div className={className}>
        <video
          className="tw-wallpaper-video"
          src={url}
          poster={posterUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{
        backgroundImage: [
          "linear-gradient(180deg, rgba(10,14,20,0.15) 0%, rgba(10,14,20,0.42) 100%)",
          `url("${url}")`,
        ].join(", "),
      }}
    />
  );
};

// Nav icons (stroke style)
export const navIcons = {
  general: <Icon name="settings" size={18} />,
  wallpaper: <Icon name="image" size={18} />,
  search: <Icon name="search" size={18} />,
  notify: <Icon name="bell" size={18} />,
  about: <Icon name="info" size={18} />,
  apps: <Icon name="grid" size={18} />,
  feedback: <Icon name="message-square" size={18} />,
};
