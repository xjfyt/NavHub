import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  FOCUSABLE_SELECTOR,
  nextFocusIndex,
  shouldTrapTab,
} from "../utils/focusTrap";

// A11Y-4 / UX-24: 统一的可访问弹窗原语。
// 提供 role="dialog" + aria-modal + aria-labelledby、焦点陷阱(Tab/Shift+Tab 循环)、
// 关闭时把焦点交还给开启前的元素、Esc 关闭、点击遮罩关闭(可配置)、打开期间锁定 body 滚动。
//
// 设计取舍:不接管各弹窗的视觉。各弹窗保留自己的遮罩 / 容器 class 与内联样式,
// Modal 只负责渲染这两层骨架并挂上无障碍属性与行为,内容原样放进 children。

let openModalCount = 0;
let savedBodyOverflow: string | null = null;

function lockBodyScroll() {
  if (openModalCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openModalCount += 1;
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.overflow = savedBodyOverflow ?? "";
    savedBodyOverflow = null;
  }
}

export interface ModalProps {
  /** 关闭回调(Esc / 遮罩点击 / 关闭按钮均调用)。 */
  onClose: () => void;
  /** 弹窗标题文本;提供后会渲染隐藏的 aria-label 锚点用于 aria-labelledby。 */
  title?: string;
  /** 若标题已在 children 中渲染,可传入其 id 作为 aria-labelledby,优先于 title。 */
  labelledById?: string;
  /** 是否允许点击遮罩关闭,默认 true。 */
  closeOnBackdrop?: boolean;
  /** 是否监听 Esc 关闭,默认 true。 */
  closeOnEsc?: boolean;
  /** 是否启用焦点陷阱,默认 true。 */
  trapFocus?: boolean;
  /** 打开时自动聚焦容器内首个可聚焦元素,默认 true(各弹窗常用 autoFocus,本项作兜底)。 */
  autoFocus?: boolean;
  /** 遮罩层 class(沿用各弹窗既有的 backdrop 类名以保留样式)。 */
  overlayClassName?: string;
  /** 遮罩层内联样式(如自定义 zIndex)。 */
  overlayStyle?: CSSProperties;
  /** 内容容器 class。 */
  className?: string;
  /** 内容容器内联样式。 */
  contentStyle?: CSSProperties;
  /** 内容容器额外属性透传(如 onWheel)。 */
  contentProps?: Record<string, unknown>;
  /** 是否渲染遮罩层。极个别弹窗(如 Profile)用分离的 backdrop+content,可关闭由外部自管。 */
  renderOverlay?: boolean;
  children: ReactNode;
}

export function Modal({
  onClose,
  title,
  labelledById,
  closeOnBackdrop = true,
  closeOnEsc = true,
  trapFocus = true,
  autoFocus = true,
  overlayClassName,
  overlayStyle,
  className,
  contentStyle,
  contentProps,
  renderOverlay = true,
  children,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  // 用 ref 持有最新的 onClose,避免它变化时反复重挂键盘监听。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const generatedTitleId = useId();
  const titleId = labelledById ?? (title ? generatedTitleId : undefined);

  // 记录开启前的焦点元素,关闭时交还(focus return)。
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    return () => {
      // 卸载时把焦点还给来源元素(若仍可聚焦)。
      if (prevActive && typeof prevActive.focus === "function") {
        prevActive.focus();
      }
    };
  }, []);

  // body 滚动锁定。
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  // 打开后兜底聚焦容器内首个可聚焦元素(各弹窗常自带 autoFocus,此处避免无落点)。
  useEffect(() => {
    if (!autoFocus) return;
    const root = contentRef.current;
    if (!root) return;
    // 若已有元素(由 autoFocus 属性)落在容器内,则不抢焦点。
    if (root.contains(document.activeElement)) return;
    const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      // 没有可聚焦元素时,让容器本身可聚焦,避免焦点留在 body。
      root.focus();
    }
  }, [autoFocus]);

  // 键盘:Esc 关闭 + 焦点陷阱。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (!trapFocus || e.key !== "Tab") return;
      const root = contentRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const count = focusables.length;
      const currentIndex = focusables.indexOf(
        document.activeElement as HTMLElement,
      );
      if (!shouldTrapTab(currentIndex, e.shiftKey, count)) return;
      e.preventDefault();
      const target = nextFocusIndex(currentIndex, e.shiftKey, count);
      if (target >= 0) {
        focusables[target].focus();
      } else {
        root.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [closeOnEsc, trapFocus]);

  const handleBackdropMouseDown = (e: ReactMouseEvent) => {
    if (!closeOnBackdrop) return;
    // 仅当按下点真正落在遮罩层(而非冒泡自内容)时关闭。
    if (e.target === e.currentTarget) onCloseRef.current();
  };

  const content = (
    <div
      ref={contentRef}
      className={className}
      style={contentStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      {...contentProps}
    >
      {title && labelledById === undefined && (
        <span id={titleId} className="sr-only">
          {title}
        </span>
      )}
      {children}
    </div>
  );

  if (!renderOverlay) {
    // 外部自管遮罩(分离式布局)。仍提供键盘与焦点行为。
    return content;
  }

  return (
    <div
      className={overlayClassName}
      style={overlayStyle}
      onMouseDown={handleBackdropMouseDown}
    >
      {content}
    </div>
  );
}
