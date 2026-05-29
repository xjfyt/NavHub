import {
  IconFontSize,
  IconImageRadius,
  IconImageStyle,
  IconSize,
  IconTextAlign,
} from "../../types";

export const SIZE_OPTIONS: { id: IconSize; name: string; cls: string }[] = [
  { id: "sq", name: "方形", cls: "sq" },
  { id: "pill-size", name: "长条", cls: "pill" },
  { id: "circle-size", name: "圆形", cls: "circle" },
  { id: "lg", name: "大图", cls: "lg" },
];

export const SOURCE_OPTIONS = [
  { id: "url", name: "自动获取", icon: "globe" },
  { id: "upload", name: "上传图片", icon: "image" },
  { id: "builtin", name: "内置库", icon: "grid" },
  { id: "library", name: "图标库", icon: "folder" },
  { id: "letter", name: "字符", icon: "type" },
] as const;

export const BUILTIN_ICON_OPTIONS = [
  "globe",
  "grid",
  "home",
  "briefcase",
  "tool",
  "code",
  "search",
  "settings",
  "star",
  "heart",
  "cloud",
  "clock",
  "calendar",
  "bell",
  "shield",
  "lock",
  "key",
  "activity",
  "link",
  "external",
  "sun",
  "moon",
  "sparkle",
  "play",
] as const;

export const IMAGE_STYLE_OPTIONS: { id: IconImageStyle; name: string }[] = [
  { id: "plain", name: "纯图" },
  { id: "framed", name: "底板" },
];

export const IMAGE_RADIUS_OPTIONS: { id: IconImageRadius; name: string }[] = [
  { id: "rounded", name: "圆角" },
  { id: "square", name: "直角" },
];

export const FONT_SIZE_OPTIONS: { id: IconFontSize; name: string }[] = [
  { id: "sm", name: "小" },
  { id: "md", name: "中" },
  { id: "lg", name: "大" },
];

export const TEXT_ALIGN_OPTIONS: { id: IconTextAlign; name: string }[] = [
  { id: "left", name: "左" },
  { id: "center", name: "中" },
  { id: "right", name: "右" },
];
