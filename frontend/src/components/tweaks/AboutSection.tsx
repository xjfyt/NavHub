import { Row, Chevron } from "../TweaksPanelParts";
import { ABOUT_PROJECT_URL } from "./constants";
import type { DocModalKind } from "./shared";

export const AboutSection = ({
  openDoc,
}: {
  openDoc: (kind: DocModalKind) => void;
}) => {
  // UX-9: 版本号由构建时注入的 __APP_VERSION__ 提供(来自 package.json),不硬编码。
  const projectUrl = ABOUT_PROJECT_URL;
  return (
    <div className="tw-content">
      <div className="tw-section">
        <div className="tw-section-title">关于</div>
        <div className="tw-section-card">
          <Row label="应用名称">
            <span style={{ color: "var(--text-soft)" }}>NavHub 导航站</span>
          </Row>
          <Row label="当前版本">
            <span style={{ color: "var(--text-soft)" }} className="mono">
              v{__APP_VERSION__}
            </span>
          </Row>
          <Row label="项目主页">
            <a
              className="tw-action-btn link"
              href={projectUrl}
              target="_blank"
              rel="noreferrer"
            >
              查看开源仓库
            </a>
          </Row>
        </div>
        <div className="tw-custom-hint">
          NavHub 是一个自托管的个人导航与工作台。版本号在构建时由 package.json
          注入。
        </div>
      </div>
      <div className="tw-section">
        <div className="tw-section-title">条款</div>
        <div className="tw-section-card">
          <Row label="用户协议" onClick={() => openDoc("terms")}>
            <Chevron />
          </Row>
          <Row label="隐私政策" onClick={() => openDoc("privacy")}>
            <Chevron />
          </Row>
        </div>
      </div>
    </div>
  );
};
