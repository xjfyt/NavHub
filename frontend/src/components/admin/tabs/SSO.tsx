import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { api } from "../../../api";
import { toast } from "sonner";

export const AdminSSO = () => {
  const [config, setConfig] = useState<{
    enabled: boolean;
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
  } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<{
    enabled?: boolean;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scopes?: string;
  }>({});
  const [showId, setShowId] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const load = async () => {
    try {
      setConfig(await api.admin.sso());
    } catch (_e) {
      /* ignore */
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (!config) return null;

  const handleEdit = () => {
    // UX-15: 进入编辑时不把已存的 Client Secret 回填到明文输入框,
    // 留空 + masked placeholder 提示「已配置」;只有用户重新输入才会更新。
    setFormData({
      ...config,
      clientSecret: "",
      scopes: config.scopes?.join(" ") || "",
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    try {
      // UX-15: clientSecret 留空表示「不修改」,只有用户输入了新值才提交,
      // 避免把空串覆盖掉已配置的密钥。
      const payload: Partial<{
        issuer: string;
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        scopes: string[];
      }> = {
        issuer: formData.issuer,
        clientId: formData.clientId,
        redirectUri: formData.redirectUri,
        scopes: (formData.scopes || "").split(" ").filter(Boolean),
      };
      if (formData.clientSecret && formData.clientSecret.trim()) {
        payload.clientSecret = formData.clientSecret.trim();
      }
      await api.admin.patchSso(payload);
      setEditMode(false);
      toast.success("SSO 配置已保存");
      load();
    } catch (e: any) {
      toast.error("保存失败：" + (e?.message || "未知错误"));
    }
  };

  const inputStyle = {
    background: "var(--admin-border-soft)",
    border: "1px solid var(--admin-border-str)",
    color: "var(--text)",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "13px",
    width: "200px",
  };

  return (
    <>
      <div
        className="admin-head"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 30,
        }}
      >
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>SSO 接入配置</h2>
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
            Casdoor / OIDC 身份源配置 (实时生效)
          </div>
        </div>
        {editMode ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="pill-btn" onClick={() => setEditMode(false)}>
              取消
            </button>
            <button className="pill-btn primary" onClick={handleSave}>
              保存
            </button>
          </div>
        ) : (
          <button className="pill-btn" onClick={handleEdit}>
            <Icon name="edit" size={12} /> 编辑配置
          </button>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <div
          className="widget glass-strong"
          style={{ padding: 24, borderRadius: 16 }}
        >
          <h3
            style={{
              fontSize: 16,
              margin: "0 0 20px 0",
              borderBottom: "1px solid var(--admin-border-str)",
              paddingBottom: 10,
            }}
          >
            OIDC 核心连接
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                padding: "4px 0",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-soft)" }}>Issuer</span>
              {editMode ? (
                <input
                  aria-label="Issuer"
                  style={inputStyle}
                  value={formData.issuer}
                  onChange={(e) =>
                    setFormData({ ...formData, issuer: e.target.value })
                  }
                />
              ) : (
                <span
                  className="mono"
                  style={{
                    color: "var(--text)",
                    wordBreak: "break-all",
                    textAlign: "right",
                  }}
                >
                  {config.issuer || "—"}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                padding: "4px 0",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-soft)" }}>Client ID</span>
              {editMode ? (
                <input
                  aria-label="Client ID"
                  style={inputStyle}
                  value={formData.clientId}
                  onChange={(e) =>
                    setFormData({ ...formData, clientId: e.target.value })
                  }
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="mono"
                    style={{
                      color: "var(--text)",
                      wordBreak: "break-all",
                      textAlign: "right",
                    }}
                  >
                    {showId
                      ? config.clientId
                      : config.clientId
                        ? "••••••••••••••••"
                        : "—"}
                  </span>
                  {config.clientId && (
                    <button
                      onClick={() => setShowId(!showId)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-soft)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <Icon name={showId ? "eye-off" : "eye"} size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                padding: "4px 0",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-soft)" }}>Client Secret</span>
              {editMode ? (
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label="Client Secret"
                  style={inputStyle}
                  value={formData.clientSecret ?? ""}
                  placeholder={
                    config.clientSecret
                      ? "已配置 · 留空则不修改"
                      : "输入 Client Secret"
                  }
                  onChange={(e) =>
                    setFormData({ ...formData, clientSecret: e.target.value })
                  }
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="mono"
                    style={{
                      color: "var(--text)",
                      wordBreak: "break-all",
                      textAlign: "right",
                    }}
                  >
                    {showSecret
                      ? config.clientSecret || "—"
                      : config.clientSecret
                        ? "••••••••••••••••"
                        : "—"}
                  </span>
                  {config.clientSecret && (
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-soft)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <Icon name={showSecret ? "eye-off" : "eye"} size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                padding: "4px 0",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-soft)" }}>Redirect URI</span>
              {editMode ? (
                <input
                  aria-label="Redirect URI"
                  style={inputStyle}
                  value={formData.redirectUri}
                  onChange={(e) =>
                    setFormData({ ...formData, redirectUri: e.target.value })
                  }
                />
              ) : (
                <span
                  className="mono"
                  style={{
                    color: "var(--text)",
                    wordBreak: "break-all",
                    textAlign: "right",
                  }}
                >
                  {config.redirectUri || "—"}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                padding: "4px 0",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-soft)" }}>Scope</span>
              {editMode ? (
                <input
                  aria-label="Scope"
                  style={inputStyle}
                  value={formData.scopes}
                  onChange={(e) =>
                    setFormData({ ...formData, scopes: e.target.value })
                  }
                />
              ) : (
                <span
                  className="mono"
                  style={{
                    color: "var(--text)",
                    wordBreak: "break-all",
                    textAlign: "right",
                  }}
                >
                  {config.scopes?.join(" ") || "—"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div
          className="widget glass-strong"
          style={{ padding: 24, borderRadius: 16 }}
        >
          <h3
            style={{
              fontSize: 16,
              margin: "0 0 20px 0",
              borderBottom: "1px solid var(--admin-border-str)",
              paddingBottom: 10,
            }}
          >
            认证配置状态
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <b style={{ fontSize: 14 }}>Casdoor OIDC</b>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-mute)",
                    marginTop: 2,
                  }}
                >
                  全局主身份验证
                </div>
              </div>
              <div
                onClick={async () => {
                  await api.admin.patchSso({ enabled: !config.enabled });
                  load();
                }}
                style={{
                  width: 34,
                  height: 20,
                  borderRadius: 10,
                  background: config.enabled
                    ? "var(--ok)"
                    : "var(--admin-border-str)",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "var(--text)",
                    position: "absolute",
                    top: 3,
                    left: config.enabled ? 17 : 3,
                    transition: "0.2s",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: 0.5,
              }}
            >
              <div>
                <b style={{ fontSize: 14 }}>本地账号密码</b>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-mute)",
                    marginTop: 2,
                  }}
                >
                  应急超级管理员验证
                </div>
              </div>
              <div
                style={{
                  width: 34,
                  height: 20,
                  borderRadius: 10,
                  background: "var(--ok)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "var(--text)",
                    position: "absolute",
                    top: 3,
                    left: 17,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminSSO;
