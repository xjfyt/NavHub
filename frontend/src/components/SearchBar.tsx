import { useState, useMemo } from "react";
import { Icon } from "./Icon";
import { useWorkspace } from "../hooks/useWorkspace";
import { BUILTIN_ENGINES, EngineLogo } from "../utils/engines";
import { CustomEngine } from "../types";

export const SearchBar = () => {
  const { workspace, updateTweaks } = useWorkspace();
  const tweaks = workspace.preferences.tweaks || {};
  const [val, setVal] = useState("");
  const [, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  
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

  const onSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && val.trim()) {
      const targetUrl = cur.url.includes('{q}') 
        ? cur.url.replace('{q}', encodeURIComponent(val))
        : cur.url + encodeURIComponent(val);
      window.open(targetUrl, "_blank");
    }
  };

  return (
    <div className="search">
      <button className="search-engine wt" onClick={(e)=>{e.stopPropagation(); setPickerOpen(p=>!p);}}>
        <div className="wt-logo-tile"><EngineLogo engine={cur} size={22}/></div>
        <Icon name={pickerOpen?"chevron-up":"chevron-down"} size={10}/>
      </button>
      
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
        onKeyDown={onSearch}
        onFocus={()=>setFocused(true)} 
        onBlur={()=>setTimeout(()=>setFocused(false),150)} 
        placeholder="输入搜索内容"
      />
    </div>
  );
};
