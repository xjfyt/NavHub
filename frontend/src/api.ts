import type {
  AdminDashboardStats,
  AdminMessage,
  AdminUser,
  AuditEntry,
  AuthStatus,
  CustomEngine,
  GroupExportData,
  GroupView,
  IconLibraryView,
  IconView,
  LibraryIconView,
  Me,
  PreferencesView,
  UserMessage,
  WidgetView,
  Workspace,
} from "./types";

export interface WeatherHour {
  h: string;
  t: string;
  i: string;
}

export interface WeatherResp {
  city: string;
  temp: string;
  cond: string;
  humidity: string;
  wind: string;
  aqi: string;
  hours: WeatherHour[];
  source: string;
}

export interface HotItem {
  title: string;
  heat: string;
  url?: string;
}

export interface NeteaseSong {
  id: number;
  title: string;
  artist: string;
  album?: string;
  picUrl?: string;
  durationMs?: number;
}


class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    cache: init.cache ?? "no-store",
    headers,
  });
  if (res.status === 401) {
    throw new ApiError(401, "unauthorized", "unauthorized");
  }
  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export { ApiError };

// ---------- Auth ----------
export const api = {
  async status(): Promise<AuthStatus> {
    return request("/auth/status");
  },
  loginUrl(): string {
    return "/auth/login";
  },
  async passwordLogin(username: string, password: string): Promise<Me> {
    return request("/auth/password", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  async logout(): Promise<void> {
    await request("/auth/logout", { method: "POST" });
  },

  // ---------- Me ----------
  async me(): Promise<Me> {
    return request("/api/me");
  },
  async patchMe(patch: { avatarUrl?: string | null; displayName?: string | null }): Promise<Me> {
    return request("/api/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  // ---------- Preferences ----------
  async prefs(): Promise<PreferencesView> {
    return request("/api/me/preferences");
  },
  async patchPrefs(patch: Partial<PreferencesView>): Promise<PreferencesView> {
    return request("/api/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  async listEngines(): Promise<CustomEngine[]> {
    const v = await request<unknown>("/api/me/engines");
    return Array.isArray(v) ? (v as CustomEngine[]) : [];
  },
  async addEngine(input: {
    name: string;
    url: string;
    color?: string;
    label?: string;
  }): Promise<CustomEngine[]> {
    return request("/api/me/engines", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async deleteEngine(id: string): Promise<void> {
    await request(`/api/me/engines/${id}`, { method: "DELETE" });
  },
  async messages(): Promise<UserMessage[]> {
    return request("/api/me/messages");
  },
  async markMessageRead(id: string): Promise<void> {
    await request(`/api/me/messages/${id}/read`, { method: "POST" });
  },
  async markAllMessagesRead(): Promise<void> {
    await request("/api/me/messages/read-all", { method: "POST" });
  },

  // ---------- Workspace ----------
  async workspace(): Promise<Workspace> {
    const ts = Date.now();
    return request(`/api/workspace?_ts=${ts}`);
  },

  // ---------- Groups ----------
  async createGroup(body: { name: string; icon?: string }): Promise<GroupView> {
    return request("/api/groups", {
      method: "POST",
      body: JSON.stringify({ icon: "grid", ...body }),
    });
  },
  async updateGroup(
    id: string,
    body: { name?: string; icon?: string },
  ): Promise<GroupView> {
    return request(`/api/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async deleteGroup(id: string): Promise<void> {
    await request(`/api/groups/${id}`, { method: "DELETE" });
  },
  async reorderGroups(order: string[]): Promise<void> {
    await request("/api/groups/reorder", {
      method: "POST",
      body: JSON.stringify({ order }),
    });
  },
  async reorderGroupItems(id: string, order: { id: string; type: "icon" | "widget" }[]): Promise<void> {
    await request(`/api/groups/${id}/reorder-items`, {
      method: "POST",
      body: JSON.stringify({ order }),
    });
  },

  // ---------- Icons ----------
  async createIcon(body: Partial<IconView> & { groupId: string; name: string }): Promise<IconView> {
    return request("/api/icons", {
      method: "POST",
      body: JSON.stringify({
        groupId: body.groupId,
        name: body.name,
        url: body.url,
        sub: body.sub,
        title: body.title,
        cta: body.cta,
        size: body.size ?? "sq",
        letter: body.letter,
        color: body.color ?? 0,
        imageUrl: body.imageUrl,
        imageStyle: body.imageStyle,
        imageRadius: body.imageRadius,
        isFolder: body.isFolder ?? false,
        iframePreview: body.iframePreview ?? false,
      }),
    });
  },
  async updateIcon(id: string, body: Partial<IconView>): Promise<IconView> {
    return request(`/api/icons/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: body.name,
        url: body.url,
        sub: body.sub,
        title: body.title,
        cta: body.cta,
        size: body.size,
        letter: body.letter,
        color: body.color,
        imageUrl: body.imageUrl,
        imageStyle: body.imageStyle,
        imageRadius: body.imageRadius,
        iframePreview: body.iframePreview,
        groupId: body.groupId,
      }),
    });
  },
  async deleteIcon(id: string): Promise<void> {
    await request(`/api/icons/${id}`, { method: "DELETE" });
  },
  async reorderIcons(groupId: string, order: string[]): Promise<void> {
    await request("/api/icons/reorder", {
      method: "POST",
      body: JSON.stringify({ groupId, order }),
    });
  },
  async mergeIcon(sourceId: string, targetId: string): Promise<IconView> {
    return request(`/api/icons/${sourceId}/merge-into/${targetId}`, {
      method: "POST",
    });
  },
  async extractFolderItem(folderId: string, itemId: string): Promise<IconView[]> {
    return request(`/api/icons/${folderId}/extract-item/${itemId}`, {
      method: "POST",
    });
  },

  // ---------- Widgets ----------
  async createWidget(body: {
    groupId: string;
    widget: string;
    wSpan?: number;
    wRow?: number | null;
    config?: unknown;
  }): Promise<WidgetView> {
    return request("/api/widgets", {
      method: "POST",
      body: JSON.stringify({
        groupId: body.groupId,
        widget: body.widget,
        wSpan: body.wSpan ?? 2,
        wRow: body.wRow ?? null,
        config: body.config ?? {},
      }),
    });
  },
  async updateWidget(id: string, body: Partial<WidgetView>): Promise<WidgetView> {
    return request(`/api/widgets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        wSpan: body.wSpan,
        wRow: body.wRow,
        config: body.config,
        sortOrder: body.sortOrder,
      }),
    });
  },
  async deleteWidget(id: string): Promise<void> {
    await request(`/api/widgets/${id}`, { method: "DELETE" });
  },

  // ---------- Widget data ----------
  async weather(
    city?: string,
    lat?: number,
    lon?: number,
  ): Promise<WeatherResp> {
    const qs = new URLSearchParams();
    if (city) qs.set("city", city);
    if (lat != null) qs.set("lat", String(lat));
    if (lon != null) qs.set("lon", String(lon));
    const tail = qs.toString() ? `?${qs}` : "";
    return request(`/api/widgets/weather${tail}`);
  },
  async hot(source?: "weibo" | "zhihu" | "bilibili" | "juejin"): Promise<HotItem[]> {
    const tail = source ? `?source=${source}` : "";
    return request(`/api/widgets/hot${tail}`);
  },
  async musicSearch(q: string, limit = 20): Promise<{ songs: NeteaseSong[] }> {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    return request(`/api/widgets/music/search?${qs}`);
  },
  musicSongUrl(id: number | string): string {
    return `/api/widgets/music/song/${id}`;
  },

  // ---------- Upload / favicon ----------
  async upload(file: File, purpose: 'icon' | 'wallpaper' | 'avatar' = 'icon'): Promise<{ url: string; filename: string; size: number; sha256?: string }> {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/api/upload?purpose=${purpose}`, { method: "POST", body: fd });
  },
  faviconUrl(url: string, size = 64): string {
    return `/api/favicon?url=${encodeURIComponent(url)}&sz=${size}`;
  },

  // ---------- Admin ----------
  admin: {
    async dashboard(): Promise<AdminDashboardStats> {
      return request("/api/admin/dashboard");
    },
    async users(): Promise<AdminUser[]> {
      return request("/api/admin/users");
    },
    async updateUser(
      id: string,
      body: { role?: string; displayName?: string },
    ): Promise<AdminUser> {
      return request(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: body.role,
          displayName: body.displayName,
        }),
      });
    },
    async deleteUser(id: string): Promise<void> {
      await request(`/api/admin/users/${id}`, { method: "DELETE" });
    },
    async pushGroup(id: string, body: {
      targetType: "all" | "role" | "user";
      targetRole?: string | null;
      targetUserId?: string | null;
      pushAllowEdit?: boolean;
    }): Promise<void> {
      await request(`/api/admin/groups/${id}/push`, { 
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async unpushGroup(id: string): Promise<void> {
      await request(`/api/admin/groups/${id}/push`, { method: "DELETE" });
    },
    async exportGroup(id: string): Promise<GroupExportData> {
      return request(`/api/admin/groups/${id}/export`);
    },
    async importGroup(data: GroupExportData): Promise<void> {
      await request(`/api/admin/groups/import`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async visibility(): Promise<Record<string, string[]>> {
      return request("/api/admin/visibility");
    },
    async putVisibility(map: Record<string, string[]>): Promise<void> {
      await request("/api/admin/visibility", {
        method: "PUT",
        body: JSON.stringify(map),
      });
    },
    async audit(params: { kind?: string; q?: string; limit?: number; offset?: number } = {}): Promise<
      AuditEntry[]
    > {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== "") qs.set(k, String(v));
      }
      const tail = qs.toString() ? `?${qs}` : "";
      return request(`/api/admin/audit${tail}`);
    },
    async settings(): Promise<Record<string, unknown>> {
      return request("/api/admin/settings");
    },
    async messages(): Promise<AdminMessage[]> {
      return request("/api/admin/messages");
    },
    async createMessage(body: {
      title: string;
      content: string;
      level: "info" | "success" | "warning" | "error";
      targetType: "all" | "role" | "user";
      targetRole?: string | null;
      targetUserId?: string | null;
      linkUrl?: string | null;
      expiresAt?: string | null;
    }): Promise<AdminMessage> {
      return request("/api/admin/messages", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async deleteMessage(id: string): Promise<void> {
      await request(`/api/admin/messages/${id}`, { method: "DELETE" });
    },
    async patchSettings(body: Record<string, unknown>): Promise<Record<string, unknown>> {
      return request("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    async sso(): Promise<{
      enabled: boolean;
      issuer: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      scopes: string[];
    }> {
      return request("/api/admin/sso");
    },
    async patchSso(body: Partial<{
      enabled: boolean;
      issuer: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      scopes: string[];
    }>): Promise<unknown> {
      return request("/api/admin/sso", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    async iconLibraries(): Promise<IconLibraryView[]> {
      return request("/api/admin/icon-libraries");
    },
    async createIconLibrary(body: { name: string; description?: string }): Promise<IconLibraryView> {
      return request("/api/admin/icon-libraries", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async deleteIconLibrary(id: string): Promise<void> {
      await request(`/api/admin/icon-libraries/${id}`, { method: "DELETE" });
    },
    async exportIconLibrary(id: string): Promise<{ library: IconLibraryView; icons: LibraryIconView[] }> {
      return request(`/api/admin/icon-libraries/${id}/export`);
    },
    async importIconLibrary(data: { library: IconLibraryView; icons: LibraryIconView[] }): Promise<void> {
      await request(`/api/admin/icon-libraries/import`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async addIconsToLibrary(libraryId: string, items: { sha256: string; name: string; url: string; size: number; contentType: string }[]): Promise<void> {
      await request(`/api/admin/icon-libraries/${libraryId}/icons`, {
        method: "POST",
        body: JSON.stringify(items),
      });
    },
    async getLibraryIcons(libraryId: string): Promise<LibraryIconView[]> {
      return request(`/api/admin/icons?libraryId=${libraryId}`);
    },
    async getUserUploads(): Promise<LibraryIconView[]> {
      return request(`/api/admin/icons?userUploadsOnly=true`);
    },
    async deleteIcon(id: string): Promise<void> {
      await request(`/api/admin/icons/${id}`, { method: "DELETE" });
    },
  },
};
