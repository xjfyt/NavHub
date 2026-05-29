import { Icon } from "../../Icon";
import type { UploadProgressState } from "./types";

interface UploadProgressBarProps {
  progress: UploadProgressState;
}

export const UploadProgressBar = ({ progress }: UploadProgressBarProps) => (
  <div
    style={{
      background: "var(--admin-border-soft)",
      border: "1px solid var(--admin-border-str)",
      borderRadius: 10,
      padding: "12px 14px",
      margin: "-18px 0 24px",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
      }}
    >
      <Icon
        name={progress.overallPercent >= 100 ? "check" : "activity"}
        size={16}
      />
      <div style={{ fontSize: 13, fontWeight: 600 }}>
        正在上传 {progress.index} / {progress.total}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: "var(--text-soft)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {progress.fileName}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-soft)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {progress.overallPercent}%
      </div>
    </div>
    <div
      style={{
        height: 8,
        borderRadius: 999,
        overflow: "hidden",
        background: "rgba(255,255,255,0.10)",
      }}
    >
      <div
        style={{
          width: `${progress.overallPercent}%`,
          height: "100%",
          borderRadius: 999,
          background: "var(--accent)",
          transition: "width 180ms ease",
        }}
      />
    </div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 6,
        fontSize: 11,
        color: "var(--text-soft)",
      }}
    >
      <span>当前文件 {progress.filePercent}%</span>
      <span>
        成功 {progress.okCount} · 失败 {progress.failCount}
      </span>
    </div>
  </div>
);
