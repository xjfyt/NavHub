import React from "react";
import {
  Row,
  Toggle,
  Dropdown,
  Chevron,
  SliderPopover,
} from "../TweaksPanelParts";
import { useI18n, LANG_OPTIONS } from "../../i18n";
import {
  sidebarOpts,
  sidebarPosOpts,
  openOpts,
  iconSizeOpts,
} from "./constants";
import type { TweaksValues, SetTweak } from "./shared";

export const GeneralSection = ({
  sub,
  setSub,
  s,
  set,
}: {
  sub: string | null;
  setSub: (v: string | null) => void;
  s: TweaksValues;
  set: SetTweak;
}) => {
  // I18N-1: 界面语言切换。语言偏好独立持久化在 localStorage(navhub_lang),与后端偏好解耦。
  const { t, lang, setLang } = useI18n();
  const langOpts = LANG_OPTIONS.map((o) => ({ id: o.id, name: t(o.nameKey) }));

  if (sub === "iconWidth") {
    return (
      <SliderPopover
        title="图标区域宽度"
        onClose={() => setSub(null)}
        items={[
          {
            label: "宽度",
            value: s.iconAreaWidth === undefined ? 0 : s.iconAreaWidth,
            min: 0,
            max: 2400,
            step: 20,
            format: (v: number) => (v === 0 ? "全宽 (100%)" : v + "px"),
            onChange: (v: number) => set("iconAreaWidth", v),
          },
        ]}
      />
    );
  }

  if (sub === "sidebarStyle") {
    return (
      <SliderPopover
        title="侧边栏样式"
        onClose={() => setSub(null)}
        items={[
          {
            label: "宽度",
            value: s.sidebarWidth || 56,
            min: 48,
            max: 84,
            step: 2,
            format: (v: number) => v + "px",
            onChange: (v: number) => set("sidebarWidth", v),
          },
          {
            label: "分类间隔",
            value: s.sidebarGap || 6,
            min: 2,
            max: 18,
            step: 1,
            format: (v: number) => v + "px",
            onChange: (v: number) => set("sidebarGap", v),
          },
        ]}
      />
    );
  }
  if (sub === "searchBox") {
    return (
      <SliderPopover
        title="搜索框样式"
        onClose={() => setSub(null)}
        items={[
          {
            label: "宽度",
            value: s.searchWidth || 560,
            min: 360,
            max: 820,
            step: 10,
            format: (v: number) => v + "px",
            onChange: (v: number) => set("searchWidth", v),
          },
          {
            label: "透明度",
            value: Math.round(((s.searchOpacity as number) ?? 0.55) * 100),
            min: 10,
            max: 100,
            step: 5,
            format: (v: number) => v + "%",
            onChange: (v: number) => set("searchOpacity", v / 100),
          },
        ]}
      />
    );
  }
  if (sub === "wheelSens") {
    return (
      <SliderPopover
        title="翻页灵敏度"
        onClose={() => setSub(null)}
        items={[
          {
            label: "灵敏度",
            value: s.wheelSensitivity || 40,
            min: 10,
            max: 100,
            step: 1,
            onChange: (v: number) => set("wheelSensitivity", v),
          },
        ]}
      />
    );
  }
  return (
    <div className="tw-content">
      <div className="tw-section">
        <div className="tw-section-title">控制栏</div>
        <div className="tw-section-card">
          <Row label="侧边栏">
            <Dropdown
              value={(s.sidebar as string) || "autohide"}
              options={sidebarOpts}
              onChange={(v) => set("sidebar", v)}
            />
          </Row>
          <Row label="侧边栏位置">
            <Dropdown
              value={(s.sidebarPos as string) || "left"}
              options={sidebarPosOpts}
              onChange={(v) => set("sidebarPos", v)}
            />
          </Row>
          <Row label="侧边栏样式" onClick={() => setSub("sidebarStyle")}>
            <Chevron
              value={`${(s.sidebarWidth as number) || 56}px · ${(s.sidebarGap as number) || 6}px`}
            />
          </Row>
        </div>
      </div>
      <div className="tw-section">
        <div className="tw-section-title">图标</div>
        <div className="tw-section-card">
          <Row label="打开方式">
            <Dropdown
              value={(s.iconOpen as string) || "newtab"}
              options={openOpts}
              onChange={(v) => set("iconOpen", v)}
            />
          </Row>
          <Row label="图标尺寸">
            <Dropdown
              value={(s.iconSize as string) || "auto"}
              options={iconSizeOpts}
              onChange={(v) => set("iconSize", v)}
            />
          </Row>
          <Row label="图标区域宽度" onClick={() => setSub("iconWidth")}>
            <Chevron
              value={
                s.iconAreaWidth === undefined || s.iconAreaWidth === 0
                  ? "全宽"
                  : s.iconAreaWidth + "px"
              }
            />
          </Row>
          <Row label="隐藏添加图标">
            <Toggle
              on={!!s.hideAddIcon}
              onChange={(v) => set("hideAddIcon", v)}
            />
          </Row>
          <Row label="隐藏图标名称">
            <Toggle
              on={!!s.hideIconName}
              onChange={(v) => set("hideIconName", v)}
            />
          </Row>
          <Row label="滚动触发翻页">
            <Toggle
              on={s.wheelPage !== false}
              onChange={(v) => set("wheelPage", v)}
            />
          </Row>
        </div>
      </div>
      <div className="tw-section">
        <div className="tw-section-title">搜索</div>
        <div className="tw-section-card">
          <Row label="搜索框样式" onClick={() => setSub("searchBox")}>
            <Chevron />
          </Row>
          <Row label="打开方式">
            <Dropdown
              value={(s.searchOpen as string) || "newtab"}
              options={openOpts}
              onChange={(v) => set("searchOpen", v)}
            />
          </Row>
          <Row label="搜索建议">
            <Toggle
              on={s.searchSuggest !== false}
              onChange={(v) => set("searchSuggest", v)}
            />
          </Row>
          <Row label="搜索历史">
            <Toggle
              on={!!s.searchHistory}
              onChange={(v) => set("searchHistory", v)}
            />
          </Row>
          <Row label="Tab键切换搜索引擎">
            <Toggle
              on={s.tabSwitchEngine !== false}
              onChange={(v) => set("tabSwitchEngine", v)}
            />
          </Row>
          <Row label="保留搜索框内容">
            <Toggle
              on={s.keepSearchText !== false}
              onChange={(v) => set("keepSearchText", v)}
            />
          </Row>
        </div>
      </div>
      <div className="tw-section">
        <div className="tw-section-title">其他设置</div>
        <div className="tw-section-card">
          <Row label={t("settings.language")}>
            <Dropdown
              value={lang}
              options={langOpts}
              onChange={(v) => setLang(v as typeof lang)}
            />
          </Row>
          <Row label="翻页灵敏度" onClick={() => setSub("wheelSens")}>
            <Chevron value={(s.wheelSensitivity as React.ReactNode) || 40} />
          </Row>
          <Row label="使用系统默认字体">
            <Toggle
              on={s.useSystemFont !== false}
              onChange={(v) => set("useSystemFont", v)}
            />
          </Row>
          <Row label="显示备案号">
            <Toggle
              on={s.showBeian !== false}
              onChange={(v) => set("showBeian", v)}
            />
          </Row>
        </div>
      </div>
    </div>
  );
};
