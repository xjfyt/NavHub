import { Icon } from "../../Icon";
import type { IconAssetSourceView } from "../../../types";
import type { SourceFormState } from "./types";
import { SCRAPER_CONFIGS } from "./constants";

interface SourceFormProps {
  form: SourceFormState;
  setForm: React.Dispatch<React.SetStateAction<SourceFormState>>;
  submitting: boolean;
  editingId: string | null;
  editingSource: IconAssetSourceView | null | undefined;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export const SourceForm = ({
  form,
  setForm,
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
            {editingId ? "编辑图标来源" : "添加图标来源"}
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
                图标来源
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

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-soft)",
                marginBottom: 4,
              }}
            >
              API / 子集地址 (支持多行、逗号分隔)
            </label>
            <textarea
              value={form.siteUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, siteUrl: e.target.value }))
              }
              placeholder="https://...可以粘贴多个地址"
              style={{
                width: "100%",
                height: 80,
                padding: "8px 10px",
                background: "var(--admin-bg)",
                border: "1px solid var(--admin-border-str)",
                borderRadius: 6,
                color: "var(--text)",
                fontSize: 13,
                resize: "vertical",
              }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 20px",
            }}
          >
            {formField("缓存时长 (小时)", "cacheTtlHours", "number", {
              min: 1,
            })}
            {formField("抓取间隔 (小时)", "fetchIntervalHours", "number", {
              min: 1,
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "0 20px",
            }}
          >
            {formField("媒体类型", "sourceType", "text", { readOnly: true })}
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
