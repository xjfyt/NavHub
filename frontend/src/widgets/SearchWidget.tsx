import React, { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { useWorkspace } from "../hooks/useWorkspace";
import { BUILTIN_ENGINES, EngineLogo } from "../utils/engines";
import { safeHttpUrl } from "../utils/iconSources";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { CustomEngine } from "../types";
import type { WidgetProps } from "./types";
import { toast } from "sonner";

interface SearchWidgetConfig {
  placeholder?: string;
}

const DEFAULTS: SearchWidgetConfig = { placeholder: "" };

export const SearchWidget = ({ w }: WidgetProps<SearchWidgetConfig> = {}) => {
  const { workspace, updateTweaks } = useWorkspace();
  const { config } = useWidgetConfig<SearchWidgetConfig>(w, DEFAULTS);
  const tweaks = workspace.preferences.tweaks || {};
  const [val, setVal] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const customEngines = Array.isArray(workspace.preferences.customEngines)
    ? (workspace.preferences.customEngines as CustomEngine[])
    : [];

  const allEngines = useMemo(() => {
    const map = { ...BUILTIN_ENGINES };
    customEngines.forEach((e) => {
      map[e.id] = {
        id: e.id,
        name: e.name,
        url: e.url,
        color: e.color,
        label: e.label,
      };
    });
    return map;
  }, [customEngines]);

  const engineKey = tweaks.searchEngine || "google";
  const cur = allEngines[engineKey] || BUILTIN_ENGINES.google;

  const runSearch = () => {
    const q = val.trim();
    if (!q) {
      toast.error("请输入搜索内容");
      return;
    }
    const targetUrl = cur.url.includes("{q}")
      ? cur.url.replace("{q}", encodeURIComponent(q))
      : cur.url + encodeURIComponent(q);
    const safe = safeHttpUrl(targetUrl);
    if (!safe) {
      toast.error("无效的搜索引擎地址");
      return;
    }
    window.open(safe, "_blank", "noopener");
  };

  const onSearch = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setPickerOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  };

  return (
    <div className="w-search-float">
      <div className="search w-search-inner" data-nobubble>
        <button
          type="button"
          className="search-engine wt"
          aria-label={`搜索引擎：${cur.name}`}
          aria-expanded={pickerOpen}
          onClick={(e) => {
            e.stopPropagation();
            setPickerOpen((p) => !p);
          }}
        >
          <div className="wt-logo-tile">
            <EngineLogo engine={cur} size={22} />
          </div>
          <Icon name={pickerOpen ? "chevron-up" : "chevron-down"} size={10} />
        </button>

        {pickerOpen && (
          <>
            <div
              className="engine-backdrop"
              onClick={() => setPickerOpen(false)}
            />
            <div
              className="engine-grid-pop"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="engine-grid">
                {Object.values(allEngines).map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    className={
                      "engine-tile " + (v.id === engineKey ? "active" : "")
                    }
                    onClick={() => {
                      updateTweaks({ searchEngine: v.id });
                      setPickerOpen(false);
                    }}
                  >
                    <div className="wt-logo-tile lg">
                      <EngineLogo engine={v} size={30} />
                    </div>
                    <div className="engine-name">{v.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <input
          className="search-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={onSearch}
          placeholder={config.placeholder || "输入搜索内容"}
          aria-label="搜索"
        />
        <button
          type="button"
          className="search-go"
          aria-label="搜索"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            runSearch();
          }}
        >
          <Icon name="search" size={16} />
        </button>
      </div>
    </div>
  );
};
