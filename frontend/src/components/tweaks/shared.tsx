import type { Tweaks } from "../../types";

/**
 * TweaksPanel 各 section 共享的类型与无状态展示件。仅为拆分而抽出，无行为变化。
 */

/** `workspace.preferences.tweaks || {}` 的宽松形态，沿用组件内逐字段 `as` 取值。 */
export type TweaksValues = Tweaks | Record<string, never>;

/** 设置某个 tweak 字段（与组件内 `set` 同签名）。 */
export type SetTweak = (k: string, v: any) => void;

export type DocModalKind = "terms" | "privacy";

export const Placeholder = ({
  title,
  text,
}: {
  title: string;
  text: string;
}) => (
  <div className="tw-content">
    <div className="tw-empty">
      <div className="tw-empty-title">{title}</div>
      <div className="tw-empty-sub">{text}</div>
    </div>
  </div>
);
