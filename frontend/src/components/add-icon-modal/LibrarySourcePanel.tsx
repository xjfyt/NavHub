import type { LibraryIconView } from "../../types";
import { Icon } from "../Icon";

interface LibrarySourcePanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  libraries: any[];
  activeLibraryId: string;
  onLibClick: (id: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  libraryIcons: LibraryIconView[];
  librarySelectedUrl: string | null;
  onSelectLibraryIcon: (url: string) => void;
}

export function LibrarySourcePanel({
  libraries,
  activeLibraryId,
  onLibClick,
  searchQuery,
  onSearchQueryChange,
  libraryIcons,
  librarySelectedUrl,
  onSelectLibraryIcon,
}: LibrarySourcePanelProps) {
  return (
    <div>
      <div
        className="tabs"
        style={{
          background: "var(--panel-bg)",
          overflowX: "auto",
          whiteSpace: "nowrap",
          display: "flex",
          padding: 4,
        }}
      >
        <button
          type="button"
          className={
            "tab " + (activeLibraryId === "user_uploads" ? "active" : "")
          }
          onClick={() => onLibClick("user_uploads")}
        >
          用户上传图库
        </button>
        {libraries.map((lib) => (
          <button
            key={lib.id}
            type="button"
            className={"tab " + (activeLibraryId === lib.id ? "active" : "")}
            onClick={() => onLibClick(lib.id)}
          >
            {lib.name}
          </button>
        ))}
      </div>
      <div
        className="search-box"
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--panel-bg)",
          border: "1px solid var(--border-color)",
          borderRadius: 6,
          padding: "2px 8px",
          marginTop: 12,
        }}
      >
        <Icon name="search" size={14} color="var(--text-soft)" />
        <input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          aria-label="搜索图标"
          placeholder="搜索图标..."
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: 13,
            padding: "6px 8px",
            width: "100%",
            color: "var(--text)",
          }}
        />
      </div>
      <div
        style={{
          marginTop: "16px",
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 8,
          maxHeight: 180,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {libraryIcons.map((icon) => (
          <div
            key={icon.id}
            className={
              "builtin-opt " + (librarySelectedUrl === icon.url ? "active" : "")
            }
            onClick={() => onSelectLibraryIcon(icon.url)}
            title={icon.name}
            style={{
              background:
                librarySelectedUrl === icon.url
                  ? "var(--accent)"
                  : "var(--panel-bg)",
              borderColor: "var(--border-color)",
              width: 44,
              height: 44,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={icon.url}
              alt={icon.name || "图标"}
              style={{
                maxWidth: 28,
                maxHeight: 28,
                objectFit: "contain",
              }}
            />
          </div>
        ))}
        {libraryIcons.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-mute)",
              gridColumn: "span 6",
              textAlign: "center",
              padding: "20px 0",
            }}
          >
            该图库暂无可选图标
          </div>
        )}
      </div>
    </div>
  );
}
