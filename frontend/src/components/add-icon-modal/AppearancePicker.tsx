import type {
  IconFontSize,
  IconImageRadius,
  IconImageStyle,
  IconTextAlign,
} from "../../types";
import {
  FONT_SIZE_OPTIONS,
  IMAGE_RADIUS_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  TEXT_ALIGN_OPTIONS,
} from "./constants";

interface AppearancePickerProps {
  showImageOptions: boolean;
  imageStyle: IconImageStyle;
  onImageStyleChange: (value: IconImageStyle) => void;
  imageRadius: IconImageRadius;
  onImageRadiusChange: (value: IconImageRadius) => void;
  fontSize: IconFontSize;
  onFontSizeChange: (value: IconFontSize) => void;
  textAlign: IconTextAlign;
  onTextAlignChange: (value: IconTextAlign) => void;
}

export function AppearancePicker({
  showImageOptions,
  imageStyle,
  onImageStyleChange,
  imageRadius,
  onImageRadiusChange,
  fontSize,
  onFontSizeChange,
  textAlign,
  onTextAlignChange,
}: AppearancePickerProps) {
  return (
    <>
      {showImageOptions && (
        <div
          className="field-row"
          style={{
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid var(--border-color)",
            marginBottom: 0,
          }}
        >
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12 }}>外观</label>
            <div className="tabs" style={{ background: "var(--panel-bg)" }}>
              {IMAGE_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={"tab " + (imageStyle === opt.id ? "active" : "")}
                  onClick={() => onImageStyleChange(opt.id)}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12 }}>边角</label>
            <div className="tabs" style={{ background: "var(--panel-bg)" }}>
              {IMAGE_RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={"tab " + (imageRadius === opt.id ? "active" : "")}
                  onClick={() => onImageRadiusChange(opt.id)}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="field-row" style={{ marginTop: "16px", marginBottom: 0 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>文字大小</label>
          <div className="tabs" style={{ background: "var(--panel-bg)" }}>
            {FONT_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={"tab " + (fontSize === opt.id ? "active" : "")}
                onClick={() => onFontSizeChange(opt.id)}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>文字对齐</label>
          <div className="tabs" style={{ background: "var(--panel-bg)" }}>
            {TEXT_ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={"tab " + (textAlign === opt.id ? "active" : "")}
                onClick={() => onTextAlignChange(opt.id)}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
