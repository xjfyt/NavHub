import { toast } from "sonner";
import { Icon } from "../Icon";
import {
  BUILTIN_ENGINES,
  EngineLogo,
  type EngineDef,
} from "../../utils/engines";
import { validateEngineInput } from "../../utils/engineHelpers";
import type { CustomEngine, PreferencesView } from "../../types";
import type { TweaksValues, SetTweak } from "./shared";

export const SearchSection = ({
  sub,
  setSub,
  editingEngine,
  setEditingEngine,
  customEnginesRaw,
  s,
  set,
  addCustomEngine,
  updateCustomEngine,
  deleteCustomEngine,
}: {
  sub: string | null;
  setSub: (v: string | null) => void;
  editingEngine: CustomEngine | null;
  setEditingEngine: (v: CustomEngine | null) => void;
  customEnginesRaw: PreferencesView["customEngines"];
  s: TweaksValues;
  set: SetTweak;
  addCustomEngine: (input: {
    name: string;
    url: string;
    color?: string;
    label?: string;
  }) => Promise<void>;
  updateCustomEngine: (
    id: string,
    patch: { name?: string; url?: string },
  ) => Promise<void>;
  deleteCustomEngine: (id: string) => Promise<void>;
}) => {
  if (sub === "engineForm") {
    const isEdit = editingEngine !== null;
    const closeForm = () => {
      setSub(null);
      setEditingEngine(null);
    };
    return (
      <form
        className="tw-content"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const result = validateEngineInput(
            (fd.get("name") as string) || "",
            (fd.get("url") as string) || "",
          );
          if (!result.ok) return toast.error(result.error);
          const { name, url } = result.value;
          if (isEdit && editingEngine) {
            updateCustomEngine(editingEngine.id, { name, url })
              .then(() => {
                closeForm();
                toast.success("已更新搜索引擎");
              })
              .catch(() => {
                /* hook 已弹 toast */
              });
          } else {
            const colors = [
              "#ef4444",
              "#f97316",
              "#f59e0b",
              "#10b981",
              "#3b82f6",
              "#6366f1",
              "#8b5cf6",
              "#ec4899",
            ];
            const color = colors[Math.floor(Math.random() * colors.length)];
            addCustomEngine({ name, url, color })
              .then(() => {
                closeForm();
                toast.success("已添加搜索引擎");
              })
              .catch((err: any) => toast.error("添加失败: " + err.message));
          }
        }}
      >
        <div className="tw-section">
          <div
            className="tw-section-title"
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <button type="button" onClick={closeForm}>
              <Icon name="chevron-left" size={16} />
            </button>
            {isEdit ? "编辑搜索引擎" : "添加自定义搜索引擎"}
          </div>
          <div className="tw-section-card">
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div>
                <label
                  htmlFor="tw-engine-name"
                  style={{
                    display: "block",
                    fontSize: 13,
                    color: "var(--text-soft)",
                    marginBottom: 6,
                  }}
                >
                  名称
                </label>
                <input
                  id="tw-engine-name"
                  name="name"
                  className="nh-input"
                  required
                  defaultValue={editingEngine?.name ?? ""}
                  placeholder="如：GitHub"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.1)",
                    border: "1px solid var(--glass-border-soft)",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="tw-engine-url"
                  style={{
                    display: "block",
                    fontSize: 13,
                    color: "var(--text-soft)",
                    marginBottom: 6,
                  }}
                >
                  搜索 URL
                </label>
                <input
                  id="tw-engine-url"
                  name="url"
                  className="nh-input"
                  required
                  defaultValue={editingEngine?.url ?? ""}
                  placeholder="包含 {q}，如：https://github.com/search?q={q}"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.1)",
                    border: "1px solid var(--glass-border-soft)",
                  }}
                />
              </div>
              <button
                type="submit"
                className="pill-btn primary"
                style={{
                  marginTop: 8,
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                {isEdit ? "保存修改" : "保存并添加"}
              </button>
            </div>
          </div>
        </div>
      </form>
    );
  }

  const customEngines = Array.isArray(customEnginesRaw)
    ? (customEnginesRaw as CustomEngine[])
    : [];

  // QUAL-13: CustomEngine 结构上可赋给 EngineDef(后者的 builtin/color/label 均可选),
  // 故显式标注元素类型为 EngineDef[],EngineLogo 不再需要 `as any`。
  const allEngines: EngineDef[] = [
    ...Object.values(BUILTIN_ENGINES),
    ...customEngines,
  ];

  return (
    <div className="tw-content">
      <div className="tw-section">
        <div className="tw-section-title">默认搜索引擎</div>
        <div className="tw-section-card" style={{ padding: 0 }}>
          {allEngines.map((e) => {
            const isCustom = !("builtin" in e) || !e.builtin;
            return (
              <div
                key={e.id}
                className="tw-row tw-row-click"
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--glass-border-soft)",
                }}
                onClick={() => set("searchEngine", e.id)}
              >
                <div
                  className="tw-row-label"
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <EngineLogo engine={e} size={20} />
                  <span>{e.name}</span>
                </div>
                <div
                  className="tw-row-ctrl"
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  {isCustom && (
                    <>
                      <button
                        type="button"
                        title="编辑"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditingEngine(e as CustomEngine);
                          setSub("engineForm");
                        }}
                        style={{ color: "var(--text-soft)", padding: 4 }}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          deleteCustomEngine(e.id);
                        }}
                        style={{ color: "var(--danger)", padding: 4 }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                  {s.searchEngine === e.id ? (
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <path
                        d="M4 8l3 3 5-6"
                        stroke="#007aff"
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <div style={{ width: 16, height: 16 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="pill-btn"
          style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
          onClick={() => {
            setEditingEngine(null);
            setSub("engineForm");
          }}
        >
          <Icon name="plus" size={14} /> 添加自定义搜索引擎
        </button>
      </div>
    </div>
  );
};
