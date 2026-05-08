export interface EngineDef {
  id: string;
  name: string;
  url: string;
  builtin?: boolean;
  color?: string;
  label?: string;
}

export const BUILTIN_ENGINES: Record<string, EngineDef> = {
  baidu:  { id: "baidu",  name: "百度",   builtin: true, url: "https://www.baidu.com/s?wd=" },
  google: { id: "google", name: "Google", builtin: true, url: "https://www.google.com/search?q=" },
  bing:   { id: "bing",   name: "Bing",   builtin: true, url: "https://www.bing.com/search?q=" },
  ddg:    { id: "ddg",    name: "DDG",    builtin: true, url: "https://duckduckgo.com/?q=" },
};

const ENGINE_ICON_SRC: Record<string, string> = {
  baidu: "/engines/baidu.ico",
  bing: "/engines/bing.ico",
  ddg: "/engines/ddg.ico",
};

export const EngineLogo = ({ engine, size = 22 }: { engine?: EngineDef; size?: number }) => {
  if (!engine) return <div style={{ width: size, height: size }} />;
  
  const s = size;
  
  if (engine.builtin) {
    const iconSrc = ENGINE_ICON_SRC[engine.id];
    if (iconSrc) {
      return (
        <img
          className="wt-logo-img"
          src={iconSrc}
          alt=""
          width={s}
          height={s}
          draggable={false}
        />
      );
    }
    if (engine.id === "google") {
      return (
        <svg viewBox="0 0 24 24" width={s} height={s}>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      );
    }
  }

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: engine.color || '#3b82f6',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: s * 0.5, fontWeight: 600, userSelect: 'none'
    }}>
      {engine.label || engine.name.substring(0, 1).toUpperCase()}
    </div>
  );
};
