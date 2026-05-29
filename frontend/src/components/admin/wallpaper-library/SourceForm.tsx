import { Icon } from "../../Icon";
import type { WallpaperSourceView } from "../../../types";
import type { SourceFormState } from "./types";
import { SCRAPER_CONFIGS, SOURCE_TYPES } from "./constants";

interface SourceFormProps {
  form: SourceFormState;
  setForm: React.Dispatch<React.SetStateAction<SourceFormState>>;
  showApiKey: boolean;
  setShowApiKey: React.Dispatch<React.SetStateAction<boolean>>;
  submitting: boolean;
  editingId: string | null;
  editingSource: WallpaperSourceView | null | undefined;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export const SourceForm = ({
  form,
  setForm,
  showApiKey,
  setShowApiKey,
  submitting,
  editingId,
  editingSource,
  onSubmit,
  onCancel,
}: SourceFormProps) => {
  const formField = (
    label: string,
    field: keyof SourceFormState,
    type: "text" | "number" | "checkbox" = "text",
    extra?: React.InputHTMLAttributes<HTMLInputElement>,
  ) => {
    const val = form[field];
    return (
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-soft)",
            marginBottom: 4,
          }}
        >
          {label}
        </label>
        {type === "checkbox" ? (
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) =>
              setForm((f) => ({ ...f, [field]: e.target.checked }))
            }
          />
        ) : (
          <input
            type={type}
            value={String(val)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                [field]:
                  type === "number" ? Number(e.target.value) : e.target.value,
              }))
            }
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "var(--admin-bg)",
              border: "1px solid var(--admin-border-str)",
              borderRadius: 6,
              color: "var(--text)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
            {...extra}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <button
          onClick={onCancel}
          style={{
            background: "var(--admin-border-str)",
            border: "none",
            width: 28,
            height: 28,
            borderRadius: "50%",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text)",
          }}
          title="返回列表"
        >
          <Icon name="chevron-left" size={14} />
        </button>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            {editingId ? "编辑壁纸来源" : "添加壁纸来源"}
          </h2>
          {editingSource ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-soft)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              正在编辑：
              <span style={{ color: "var(--text)", fontWeight: 500 }}>
                {editingSource.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  background: "var(--admin-border-str)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {editingSource.scraperType}
              </span>
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
              选择爬虫类型并填写参数，保存后立即生效。
            </p>
          )}
        </div>
      </div>

      <div
        style={{
          background: "var(--admin-border-soft)",
          border: "1px solid var(--admin-border-str)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <form onSubmit={onSubmit}>
          {/* Row 1: scraper type + name */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr",
              gap: "0 20px",
            }}
          >
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-soft)",
                  marginBottom: 4,
                }}
              >
                壁纸来源
              </label>
              <select
                value={form.scraperType}
                onChange={(e) => {
                  const t = e.target.value;
                  const cfg = SCRAPER_CONFIGS[t];
                  setForm((f) => ({
                    ...f,
                    scraperType: t,
                    siteUrl: cfg?.defaultUrl ?? f.siteUrl,
                    apiKey: "",
                    fetchBatchSize: cfg?.defaultBatch ?? f.fetchBatchSize,
                    name: f.name || cfg?.label || f.name,
                  }));
                }}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  background: "var(--admin-bg)",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 13,
                }}
              >
                {Object.entries(SCRAPER_CONFIGS).map(([id, cfg]) => (
                  <option key={id} value={id}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>
            {formField("名称", "name", "text", {
              placeholder: "自定义来源名称",
            })}
          </div>

          {/* API Key field — shown only for scrapers that support it */}
          {SCRAPER_CONFIGS[form.scraperType]?.keyParam &&
            (() => {
              const cfg = SCRAPER_CONFIGS[form.scraperType];
              return (
                <div style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--text-soft)",
                      marginBottom: 4,
                    }}
                  >
                    API Key
                    {cfg.keyRequired ? (
                      <span style={{ color: "#ff6b6b" }}> *</span>
                    ) : (
                      <span style={{ color: "var(--text-soft)" }}> (可选)</span>
                    )}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={form.apiKey}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, apiKey: e.target.value }))
                      }
                      placeholder={
                        cfg.keyRequired ? "请填写 API Key" : "留空则跳过认证"
                      }
                      autoComplete="off"
                      style={{
                        width: "100%",
                        padding: "6px 36px 6px 10px",
                        background: "var(--admin-bg)",
                        border: `1px solid ${cfg.keyRequired && !form.apiKey ? "rgba(255,107,107,0.4)" : "var(--admin-border-str)"}`,
                        borderRadius: 6,
                        color: "var(--text)",
                        fontSize: 13,
                        boxSizing: "border-box",
                        fontFamily: form.apiKey ? "monospace" : "inherit",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      title={showApiKey ? "隐藏密钥" : "显示密钥"}
                      style={{
                        position: "absolute",
                        right: 6,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-soft)",
                        padding: 4,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Icon name={showApiKey ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                  {cfg.keyHint && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-soft)",
                        marginTop: 4,
                      }}
                    >
                      {cfg.keyHint}
                    </div>
                  )}
                </div>
              );
            })()}

          {form.scraperType !== "manual" && (
            <>
              {/* API URL */}
              {formField("API 地址", "siteUrl", "text", {
                placeholder: "https://...",
              })}

              {/* Numeric params */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "0 20px",
                }}
              >
                {formField("单次抓取数量", "fetchBatchSize", "number", {
                  min: 1,
                  max: SCRAPER_CONFIGS[form.scraperType]?.maxBatch ?? 50,
                })}
                {formField("缓存时长 (小时)", "cacheTtlHours", "number", {
                  min: 1,
                })}
                {formField("抓取间隔 (小时)", "fetchIntervalHours", "number", {
                  min: 1,
                })}
              </div>
            </>
          )}
          {SCRAPER_CONFIGS[form.scraperType]?.batchHint && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-soft)",
                marginTop: form.scraperType === "manual" ? 0 : -8,
                marginBottom: 14,
              }}
            >
              {SCRAPER_CONFIGS[form.scraperType].batchHint}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "0 20px",
            }}
          >
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-soft)",
                  marginBottom: 4,
                }}
              >
                媒体类型
              </label>
              <select
                value={form.sourceType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceType: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  background: "var(--admin-bg)",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 13,
                }}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                paddingTop: 22,
              }}
            >
              <input
                type="checkbox"
                id="enabled-chk"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enabled: e.target.checked }))
                }
              />
              <label
                htmlFor="enabled-chk"
                style={{ fontSize: 13, cursor: "pointer" }}
              >
                启用自动抓取
              </label>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "7px 16px",
                background: "transparent",
                border: "1px solid var(--admin-border-str)",
                borderRadius: 8,
                color: "var(--text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "7px 16px",
                background: "var(--accent)",
                color: "var(--text-inv)",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {submitting ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
