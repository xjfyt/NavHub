import { useWidgetSetup } from "./widgetSetup";

export function WidgetEmpty({
  title,
  hint,
  cta,
  widgetId,
}: {
  title: string;
  hint?: string;
  cta?: string;
  widgetId?: string;
}) {
  const setup = useWidgetSetup();
  const canSetup = !!(cta && widgetId && setup);
  const activate = () => {
    if (!canSetup) return;
    setup!.openEdit(widgetId!);
  };

  return (
    <div
      className={"widget-empty" + (canSetup ? " is-setup" : "")}
      role={canSetup ? "button" : undefined}
      tabIndex={canSetup ? 0 : undefined}
      onMouseDown={(e) => {
        if (canSetup) e.stopPropagation();
      }}
      onClick={(e) => {
        if (!canSetup) return;
        e.stopPropagation();
        activate();
      }}
      onKeyDown={(e) => {
        if (!canSetup) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          activate();
        }
      }}
    >
      <div style={{ fontSize: 13, color: "var(--text)" }}>{title}</div>
      {hint ? (
        <div className="muted" style={{ fontSize: 11, lineHeight: 1.4 }}>
          {hint}
        </div>
      ) : null}
      {canSetup ? <span className="widget-empty-cta">{cta}</span> : null}
    </div>
  );
}
