import React from "react";

export const DocumentModal = ({
  title,
  content,
  onClose,
}: {
  title: string;
  content: React.ReactNode;
  onClose: () => void;
}) => {
  return (
    <div
      className="tw-overlay"
      style={{ zIndex: 99999 }}
      onClick={onClose}
    >
      <div
        className="tw-modal"
        style={{ width: 600, maxWidth: "90vw", height: "auto", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 30px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--text-soft)", cursor: "pointer" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ padding: "30px", overflowY: "auto", flex: 1, fontSize: 14, lineHeight: 1.6, color: "var(--text-normal)" }}>
          {content}
        </div>
      </div>
    </div>
  );
};

export const TermsContent = () => (
  <div>
    <h3>NavHub 用户协议</h3>
    <p>欢迎使用 NavHub！在您使用本服务之前，请务必仔细阅读以下协议内容。</p>
    <h4>1. 服务说明</h4>
    <p>NavHub 提供可高度自定义的工作台导航服务。我们将尽力保证服务的稳定性，但对因不可抗力导致的中断不承担责任。</p>
    <h4>2. 用户行为规范</h4>
    <p>您在使用本服务时必须遵守当地法律法规。不得利用本平台发布、存储或传播任何非法、侵权、色情或暴力的内容。</p>
    <h4>3. 权责声明</h4>
    <p>我们将不断优化功能，保留对本服务规则更新的权利。如有重大变更将另行通知。继续使用即代表您同意最新协议。</p>
    <p><em>(此处为示例文本，请自行在项目中补充详细协议内容)</em></p>
  </div>
);

export const PrivacyContent = () => (
  <div>
    <h3>NavHub 隐私政策</h3>
    <p>我们非常重视您的隐私。本政策简要说明我们如何收集、使用和保护您的个人信息。</p>
    <h4>1. 收集的信息</h4>
    <p>当您注册并使用我们的服务时，我们可能会收集您的基本标识信息（如用户名、邮箱）、您的偏好设置以及使用数据（如系统日志），用于改善产品体验。</p>
    <h4>2. 信息的使用与保护</h4>
    <p>我们收集的信息仅用于维护与改进产品功能、进行问题排查。我们已采取合理的加密和防范措施，防止您的信息遭到未经授权的访问、泄露或破坏。</p>
    <h4>3. 免密环境与第三方</h4>
    <p>如果您通过第三方身份源 (SSO) 登录，我们将遵循相关 OpenID 协议获取必要的属性信息。我们绝对不会将您的个人追踪信息出售给任何第三方商业机构。</p>
    <p><em>(此处为示例文本，请自行在项目中补充详细隐私条款)</em></p>
  </div>
);
