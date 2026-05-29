import type { MutableRefObject } from "react";
import { Icon } from "../Icon";

interface UploadSourcePanelProps {
  fileRef: MutableRefObject<HTMLInputElement | null>;
  uploading: boolean;
  dragOver: boolean;
  uploadedImageUrl: string | null;
  onSetDragOver: (over: boolean) => void;
  onUploadFile: (file?: File | null) => void;
  onClearUploadedImage: () => void;
}

export function UploadSourcePanel({
  fileRef,
  uploading,
  dragOver,
  uploadedImageUrl,
  onSetDragOver,
  onUploadFile,
  onClearUploadedImage,
}: UploadSourcePanelProps) {
  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg,.ico"
        className="hidden"
        onChange={(e) => {
          void onUploadFile(e.target.files?.[0] || null);
          e.currentTarget.value = "";
        }}
      />
      <div
        className={"upload-zone" + (dragOver ? " over" : "")}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          onSetDragOver(true);
        }}
        onDragLeave={() => onSetDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          void onUploadFile(e.dataTransfer.files?.[0] || null);
        }}
        style={{
          background: "var(--panel-bg)",
          borderColor: "var(--border-color)",
          padding: "24px 0",
        }}
      >
        <Icon
          name={uploading ? "activity" : "plus"}
          size={24}
          color="var(--text-mute)"
        />
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500 }}>
          {uploading
            ? "上传中..."
            : uploadedImageUrl
              ? "已上传，点击替换"
              : "点击或拖拽上传"}
        </div>
      </div>
      {uploadedImageUrl && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
            color: "var(--text-mute)",
          }}
        >
          <img
            src={uploadedImageUrl}
            alt="已上传图标预览"
            style={{
              width: 32,
              height: 32,
              objectFit: "contain",
              borderRadius: 8,
              background: "var(--panel-bg)",
              padding: 4,
            }}
          />
          <div
            style={{
              flex: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {uploadedImageUrl}
          </div>
          <button
            type="button"
            className="pill-btn"
            style={{ height: 28, fontSize: 12 }}
            onClick={onClearUploadedImage}
          >
            移除
          </button>
        </div>
      )}
    </div>
  );
}
