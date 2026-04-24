export type Role = "superadmin" | "admin" | "user" | "guest";

export interface Me {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  hasPassword: boolean;
}

export interface GroupView {
  id: string;
  name: string;
  icon: string;
  ownerId: string | null;
  ownerName: string | null;
  pushed: boolean;
  pushTargetType: MessageTargetType;
  pushTargetRole: string | null;
  pushTargetUserId: string | null;
  pushAllowEdit: boolean;
  sortOrder: number;
  readOnly: boolean;
}

export type IconSize = "sq" | "pill-size" | "circle-size" | "lg" | "lg-4" | "lg-9";
export type IconImageStyle = "framed" | "plain";
export type IconImageRadius = "rounded" | "square";
export type IconFontSize = "sm" | "md" | "lg";
export type IconTextAlign = "left" | "center" | "right";

export interface FolderItemView {
  id: string;
  name: string;
  letter: string | null;
  color: number;
  url: string | null;
  imageUrl: string | null;
  imageStyle: IconImageStyle;
  imageRadius: IconImageRadius;
  sortOrder: number;
}

export interface IconView {
  id: string;
  groupId: string;
  name: string;
  url: string | null;
  sub: string | null;
  title: string | null;
  cta: string | null;
  size: IconSize;
  letter: string | null;
  color: number;
  imageUrl: string | null;
  imageStyle: IconImageStyle;
  imageRadius: IconImageRadius;
  isFolder: boolean;
  iframePreview: boolean;
  sortOrder: number;
  gridX: number | null;
  gridY: number | null;
  fontSize: IconFontSize;
  textAlign: IconTextAlign;
  folderItems: FolderItemView[];
  readOnly: boolean;
}

export interface WidgetView {
  id: string;
  groupId: string;
  widget: string;
  wSpan: number;
  wRow: number | null;
  config: Record<string, unknown>;
  sortOrder: number;
  gridX: number | null;
  gridY: number | null;
  readOnly: boolean;
}

export interface Tweaks {
  theme?: string;
  mode?: string;
  backgroundMode?: "theme" | "wallpaper";
  wallpaperMediaType?: "image" | "video";
  searchEngine?: string;
  iconShape?: string;
  gridCols?: number;
  iconSize?: string;
  glass?: number;
  sidebar?: string;
  sidebarPos?: string;
  sidebarWidth?: number;
  sidebarGap?: number;
  iconOpen?: string;
  iconAreaWidth?: number;
  hideAddIcon?: boolean;
  hideIconName?: boolean;
  wheelPage?: boolean;
  searchWidth?: number;
  searchOpacity?: number;
  searchOpen?: string;
  searchSuggest?: boolean;
  searchHistory?: boolean;
  tabSwitchEngine?: boolean;
  keepSearchText?: boolean;
  wheelSensitivity?: number;
  useSystemFont?: boolean;
  showBeian?: boolean;
  wallpaperId?: string;
  wallpaperName?: string;
  wallpaperUrl?: string;
  wallpaperThumb?: string;
  wallpaperProvider?: string;
  wallpaperProviderUrl?: string;
  wallpaperSourceUrl?: string;
  wallpaperLicense?: string;
  wallpaperAuthor?: string;
  wallpaperPosterUrl?: string;
  wallpaperShuffle?: boolean;
  wallpaperShuffleInterval?: number;
  [key: string]: unknown;
}

export interface CustomEngine {
  id: string;
  name: string;
  url: string;
  color: string;
  label: string;
}

export interface PreferencesView {
  tweaks: Tweaks;
  customEngines: CustomEngine[] | Record<string, unknown>;
  pushedGroupWallpapers: Record<string, string>;
  sidebarOrder: string[];
}

export interface Workspace {
  groups: GroupView[];
  icons: IconView[];
  widgets: WidgetView[];
  preferences: PreferencesView;
  iframeWhitelist: string[];
  guest: boolean;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  target: string | null;
  kind: string;
  detail: unknown;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  hasPassword: boolean;
  casdoorBound: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AdminDashboardStats {
  totalUsers: number;
  onlineUsers: number;
  totalIcons: number;
  totalGroups: number;
  recentAudit: AuditEntry[];
  rolesDistribution: Record<string, number>;
}

export type MessageLevel = "info" | "success" | "warning" | "error";
export type MessageTargetType = "all" | "role" | "user";

export interface UserMessage {
  id: string;
  title: string;
  content: string;
  level: MessageLevel;
  targetType: MessageTargetType;
  targetRole: Role | null;
  targetUserId: string | null;
  linkUrl: string | null;
  createdByName: string | null;
  createdAt: string;
  readAt: string | null;
  expiresAt: string | null;
}

export interface AdminMessage {
  id: string;
  title: string;
  content: string;
  level: MessageLevel;
  targetType: MessageTargetType;
  targetRole: Role | null;
  targetUserId: string | null;
  targetUserName: string | null;
  linkUrl: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface AuthStatus {
  authenticated: boolean;
  ssoEnabled: boolean;
  passwordEnabled: boolean;
  issuer?: string;
  appName: string;
  mustChangePassword: boolean;
}

// ---------- Icon Library ----------
export interface IconLibraryView {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryIconView {
  id: string;
  libraryId: string | null;
  sha256: string;
  name: string;
  url: string;
  uploaderId: string | null;
  uploaderName: string | null;
  size: number;
  contentType: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Group Import/Export ----------
export interface GroupExportData {
  group: GroupView;
  icons: IconView[];
  widgets: WidgetView[];
}
