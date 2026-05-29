import { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { useWorkspace } from "../hooks/useWorkspace";
import { BUILTIN_ENGINES, EngineLogo } from "../utils/engines";
import { nextEngineId } from "../utils/engineHelpers";
import { CustomEngine } from "../types";

export const SearchBar = () => {
  const { workspace, updateTweaks } = useWorkspace();
  const tweaks = workspace.preferences.tweaks || {};
  const [val, setVal] = useState("");
  const [, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // UX-7: Tab 切换引擎后短暂高亮当前引擎名,给出可见反馈。
  const [switchHint, setSwitchHint] = useState(false);
  const hintTimer = useRef<number | null>(null);

  const customEngines = Array.isArray(workspace.preferences.customEngines)
    ? (workspace.preferences.customEngines as CustomEngine[])
    : [];

  const allEngines = useMemo(() => {
    const map = { ...BUILTIN_ENGINES };
    customEngines.forEach((e) => {
      map[e.id] = { id: e.id, name: e.name, url: e.url, color: e.color, label: e.label };
    });
    return map;
  }, [customEngines]);

  const engineKey = tweaks.searchEngine || "google";
  const cur = allEngines[engineKey] || BUILTIN_ENGINES.google;
  const tabSwitchOn = tweaks.tabSwitchEngine !== false;

  useEffect(() => {
    return () => { if (hintTimer.current) window.clearTimeout(hintTimer.current); };
  }, []);

  const flashHint = () => {
    setSwitchHint(true);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setSwitchHint(false), 900);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // UX-7: 完成「Tab 切换搜索引擎」。在搜索框内按 Tab(无修饰键)循环到下一个引擎,
    // 阻止默认的焦点跳转;由偏好开关 tabSwitchEngine 控制(默认开启)。
    if (e.key === "Tab" && tabSwitchOn && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const ids = Object.keys(allEngines);
      const next = nextEngineId(ids, engineKey);
      if (next !== engineKey) {
        updateTweaks({ searchEngine: next });
        flashHint();
      }
      return;
    }
    if (e.key === "Enter" && val.trim()) {
      const targetUrl = cur.url.includes("{q}")
        ? cur.url.replace("{q}", encodeURIComponent(val))
        : cur.url + encodeURIComponent(val);
      window.open(targetUrl, "_blank");
    }
  };

  return (
    <div className="search">
      <button
        className={"search-engine wt" + (switchHint ? " engine-switched" : "")}
        onClick={(e)=>{e.stopPropagation(); setPickerOpen(p=>!p);}}
        title={tabSwitchOn ? `当前：${cur.name}（按 Tab 切换）` : cur.name}
      >
        <div className="wt-logo-tile"><EngineLogo engine={cur} size={22}/></div>
        <Icon name={pickerOpen?"chevron-up":"chevron-down"} size={10}/>
      </button>

      {switchHint && (
        <div className="engine-switch-toast" role="status">{cur.name}</div>
      )}

      {pickerOpen && (
        <>
          <div className="engine-backdrop" onClick={()=>setPickerOpen(false)}/>
          <div className="engine-grid-pop" onClick={e=>e.stopPropagation()}>
            <div className="engine-grid">
              {Object.values(allEngines).map((v) => (
                <div key={v.id} className={"engine-tile "+(v.id===engineKey?"active":"")} onClick={()=>{ updateTweaks({ searchEngine: v.id }); setPickerOpen(false);}}>
                  <div className="wt-logo-tile lg"><EngineLogo engine={v} size={30}/></div>
                  <div className="engine-name">{v.name}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <input
        className="search-input"
        value={val}
        onChange={e=>setVal(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={()=>setFocused(true)}
        onBlur={()=>setTimeout(()=>setFocused(false),150)}
        placeholder="输入搜索内容"
      />
    </div>
  );
};
