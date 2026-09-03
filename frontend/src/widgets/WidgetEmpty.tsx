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
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flex: 1,
        textAlign: "center",
        color: "var(--text-soft)",
        padding: "10px 8px",
        minHeight: 0,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--text)" }}>{title}</div>
      {hint ? (
        <div className="muted" style={{ fontSize: 11, lineHeight: 1.4 }}>
          {hint}
        </div>
      ) : null}
      {canSetup ? (
        <button
          type="button"
          className="widget-empty-cta"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setup!.openEdit(widgetId!);
          }}
        >
          {cta}
        </button>
      ) : null}
    </div>
  );
}
